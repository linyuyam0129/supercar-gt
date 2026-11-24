// 比賽場景：賽道、玩家賽車、追車鏡頭、比賽流程（五燈起跑 / 計圈 / 檢查點罰時 / 完賽金幣）、
// 失誤偵測（偏離賽道、逆向、碰撞、打滑、錯過檢查點）與三種提醒（震動 / 語音 / 畫面）
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { MISTAKES, PAINTS } from './data.js';
import { Profile, Settings } from './store.js';
import { Input, rumble } from './input.js';
import { buildCar } from './carModel.js';
import { CarPhysics } from './carPhysics.js';
import { Track } from './track.js';
import * as Audio from './audio.js';

const $ = (id) => document.getElementById(id);
export const CAMERA_NAMES = ['近距離追車', '遠距離追車', '車頭視角'];
const COUNTDOWN = 5.5;
const PENALTY = 3;

export function formatTime(t) {
  if (t < 0) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

export class Race {
  constructor(renderer, camera, quality, hooks) {
    this.renderer = renderer;
    this.camera = camera;
    this.hooks = hooks; // { onFinish(html), toast(text) }
    this.quality = quality;
    const scene = this.scene = new THREE.Scene();

    // 天空、太陽、霧、環境反射
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(140));
    u.sunPosition.value.copy(sunDir);
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.assign(sky2.material.uniforms.sunPosition.value, sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a4a2a }));
    ground.position.y = -2;
    envScene.add(ground);
    this.envMap = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();
    scene.fog = new THREE.Fog(0xb4c4d6, 380, 2600);

    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.copy(sunDir).multiplyScalar(120);
    sun.castShadow = quality !== 'low';
    const ss = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(ss, ss);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sunOffset = sunDir.clone().multiplyScalar(150);
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a5a35, 0.5));

    this.track = new Track(scene, { quality });

    // 玩家賽車
    const spec = this.spec = Profile.selectedCar();
    this.model = buildCar(spec, PAINTS[Profile.paintOf(spec)], { shadows: quality !== 'low' });
    scene.add(this.model.root);
    this.car = new CarPhysics(spec);

    camera.near = 0.1; camera.far = 5000; camera.fov = 60;
    camera.updateProjectionMatrix();
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shake = 0;

    this.detector = new MistakeDetector(this);
    this.accum = 0;
    this.paused = false;
    this.restart();
  }

  // ---------------- 流程 ----------------
  restart() {
    this.state = 'countdown';
    this.countdownLeft = COUNTDOWN;
    this.lightsOn = 0; this.lastLights = -1;
    this.track.setStartLights(0);
    this.totalLaps = Settings.laps || 3;
    this.lap = 1;
    this.raceTime = 0; this.lapTime = 0; this.penalty = 0;
    this.bestLap = -1;
    this.lapTimes = [];
    this.nextCp = 0;
    this.lapStarted = false;
    this.lapMistakeStart = 0; this.cleanLaps = 0; this.coins = 0;
    this.detector.resetAll();
    this.progress = this.track.startIndex;
    this.placeCarAt(this.progress, 0);
    this.snapCamera();
    $('finish').classList.remove('show');
    Audio.startEngine(this.spec.enginePitch);
  }

  placeCarAt(idx, lateral = 0) {
    const p = this.track.points[idx], t = this.track.tangents[idx], r = this.track.rights[idx];
    this.car.reset(p.x + r.x * lateral, p.z + r.z * lateral, Math.atan2(t.x, t.z));
    this.car.applyVisual(this.model);
  }

  resetCar() {
    if (this.state !== 'racing') return;
    this.placeCarAt(this.progress);
    this.snapCamera();
    this.detector.resetTimers();
  }

  // ---------------- 每畫格 ----------------
  update(dt, menuOpen) {
    this.paused = menuOpen;
    if (menuOpen) { Audio.updateEngine(this.car.rpm, 0, true); this.render(); return; }
    const enabled = this.state === 'racing';
    let throttle = Input.throttle;
    if (Settings.autoThrottle && enabled && Input.brake < 0.1 && !Input.handbrake) throttle = 1;
    this.car.updateSteer(dt, enabled ? Input.steer : 0);

    if (Input.camera) { Settings.camera = (Settings.camera + 1) % 3; this.hooks.toast('視角：' + CAMERA_NAMES[Settings.camera]); }
    if (Input.reset && this.state === 'racing') this.resetCar();

    // 固定步長物理
    this.accum = Math.min(this.accum + dt, 0.1);
    const h = 1 / 120;
    while (this.accum >= h) {
      this.car.step(h, { throttle: enabled ? throttle : 0, brake: enabled ? Input.brake : 0, handbrake: enabled && Input.handbrake, enabled });
      this.collide();
      this.accum -= h;
    }
    this.updateProgress();
    this.car.applyVisual(this.model);
    this.model.setBrake((Input.brake > 0.1 && this.car.forwardSpeed > 1) || Input.handbrake || !enabled);
    Audio.updateEngine(this.car.rpm, enabled ? throttle : 0, false);

    switch (this.state) {
      case 'countdown': {
        this.countdownLeft -= dt;
        const el = COUNTDOWN - this.countdownLeft;
        this.lightsOn = Math.max(0, Math.min(5, Math.floor(el - 0.5) + 1));
        if (this.lightsOn !== this.lastLights) {
          this.lastLights = this.lightsOn;
          this.track.setStartLights(this.lightsOn);
          if (this.lightsOn > 0) Audio.beep(660, 0.18);
        }
        if (this.countdownLeft <= 0) {
          this.state = 'racing';
          this.lightsOn = 0;
          this.track.setStartLights(0);
          Audio.beep(1320, 0.45);
          this.detector.resetTimers();
        }
        break;
      }
      case 'racing':
        this.raceTime += dt;
        this.lapTime += dt;
        this.updateCheckpoints();
        this.detector.update(dt);
        break;
      case 'finished':
        break;
    }
    this.updateCamera(dt);
    this.render();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  updateProgress() {
    const c = this.car, t = this.track;
    let { index, sqr } = t.findNearest(c.x, c.z, this.progress, 60);
    if (sqr > 45 * 45) ({ index } = t.findNearest(c.x, c.z));
    this.progress = index;
    this.lateralPos = t.lateral(c.x, c.z, index);
    const abs = Math.abs(this.lateralPos);
    c.offTrack = abs > t.halfWidth + t.curbWidth;
    this.offTrack = abs > t.halfWidth + t.curbWidth + 0.2;
  }

  collide() {
    const c = this.car, t = this.track;
    const { index } = t.findNearest(c.x, c.z, this.progress, 30);
    const lat = t.lateral(c.x, c.z, index);
    const r = t.rights[index];
    const hw = this.spec.maxHalfWidth * 0.95;
    // 車身兩端（前後）都要檢查，用車長的一半估算車頭方向在側向的延伸
    const ext = Math.abs(Math.sin(c.h - Math.atan2(t.tangents[index].x, t.tangents[index].z))) * this.spec.length * 0.5;
    const reach = hw + ext * 0.9;
    let dv = 0;
    if (lat + reach > t.rightBarrier[index]) dv = c.collide(-r.x, -r.z, lat + reach - t.rightBarrier[index]);
    else if (lat - reach < -t.leftBarrier[index]) dv = c.collide(r.x, r.z, -t.leftBarrier[index] - (lat - reach));
    for (const o of t.obstacles) {
      const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), min = o.r + hw;
      if (d < min && d > 1e-3) dv = Math.max(dv, c.collide(dx / d, dz / d, min - d));
    }
    if (dv > 1.5) Audio.impact(Math.min(1, dv / 10));
    if (dv > 0) this.detector.onCollision(dv);
  }

  inZone(cp) { return this.track.wrap(this.progress - this.track.checkpoints[cp]) <= this.track.checkpointZone; }

  updateCheckpoints() {
    const c = this.car, t = this.track;
    const tan = t.tangents[this.progress];
    if (c.vx * tan.x + c.vz * tan.z < 0.5) return; // 只在順向前進時判定
    const n = t.checkpoints.length;
    const near = Math.abs(this.lateralPos) < t.halfWidth + 5;
    for (let k = 0; k < 3; k++) {
      const cp = (this.nextCp + k) % n;
      if (!this.inZone(cp)) continue;
      if (k === 0) { if (near) this.pass(cp); }
      else {
        for (let s = 0; s < k; s++) if ((this.nextCp + s) % n === 0) this.crossLine();
        if (this.state !== 'racing') return;
        this.penalty += PENALTY * k;
        this.detector.report('checkpoint');
        this.pass(cp);
      }
      return;
    }
  }
  pass(cp) {
    this.nextCp = (cp + 1) % this.track.checkpoints.length;
    if (cp === 0) this.crossLine();
  }
  crossLine() {
    if (!this.lapStarted) { this.lapStarted = true; this.lapTime = 0; this.lapMistakeStart = this.detector.total; return; }
    this.completeLap();
  }
  completeLap() {
    if (this.state !== 'racing') return;
    this.lapTimes.push(this.lapTime);
    if (this.detector.total === this.lapMistakeStart) this.cleanLaps++;
    this.lapMistakeStart = this.detector.total;
    const best = this.bestLap < 0 || this.lapTime < this.bestLap;
    if (best) this.bestLap = this.lapTime;
    if (this.lap >= this.totalLaps) { this.finish(); return; }
    this.hooks.toast(`第 ${this.lap} 圈 ${formatTime(this.lapTime)}${best ? '　最佳單圈！' : ''}`, 3000);
    this.lap++;
    this.lapTime = 0;
  }
  finish() {
    this.state = 'finished';
    let coins = 400 + 150 * this.totalLaps + 250 * this.cleanLaps + (this.detector.total === 0 ? 500 : 0);
    if (Profile.vip) coins *= 2;
    this.coins = coins;
    Profile.addCoins(coins);
    const d = this.detector;
    const mis = Object.keys(MISTAKES).filter((k) => d.counts[k]).map((k) => `${MISTAKES[k].name} ×${d.counts[k]}`).join('　');
    const html = `
      <div class="total">${formatTime(this.raceTime + this.penalty)}</div>
      ${this.penalty > 0 ? `<div style="color:#c99bff">（含罰時 +${this.penalty.toFixed(1)} 秒）</div>` : ''}
      <div>最佳單圈　${formatTime(this.bestLap)}</div>
      <div class="dim" style="font-size:13px">${this.lapTimes.map((t, i) => `第 ${i + 1} 圈 ${formatTime(t)}`).join('　')}</div>
      <div style="margin-top:6px"><b>失誤統計：共 ${d.total} 次</b></div>
      <div style="font-size:13px">${mis || '<span style="color:#3ee07f">零失誤，完美駕駛！</span>'}</div>
      <div class="reward"><span class="coin"></span>獲得金幣 +${coins.toLocaleString()}${Profile.vip ? '（VIP ×2）' : ''}</div>
      <div class="dim" style="font-size:13px">無失誤圈 ${this.cleanLaps} / ${this.totalLaps}　·　目前金幣 ${Profile.coins.toLocaleString()}</div>`;
    this.hooks.onFinish(html);
  }

  // ---------------- 鏡頭 ----------------
  snapCamera() { this.updateCamera(1, true); }
  updateCamera(dt, snap = false) {
    const c = this.car, cam = this.camera;
    const mode = Settings.camera || 0;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const sp = c.speed;
    // 鏡頭朝向：車頭方向與速度方向混合，甩尾時看得到車側
    let dx = fx, dz = fz;
    if (sp > 3 && c.forwardSpeed > 0) { dx = fx * 0.75 + c.vx / sp * 0.25; dz = fz * 0.75 + c.vz / sp * 0.25; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
    let target, look;
    if (mode === 2) {
      target = new THREE.Vector3(c.x + fx * 0.3, 1.12, c.z + fz * 0.3);
      look = new THREE.Vector3(c.x + fx * 20, 0.9, c.z + fz * 20);
    } else {
      const dist = mode === 0 ? 6.2 : 9.5, height = mode === 0 ? 2.0 : 3.1;
      target = new THREE.Vector3(c.x - dx * dist, height, c.z - dz * dist);
      look = new THREE.Vector3(c.x + fx * 3, 0.9, c.z + fz * 3);
    }
    if (snap || mode === 2) { this.camPos.copy(target); this.camLook.copy(look); }
    else {
      const k = 1 - Math.exp(-dt * 7);
      this.camPos.lerp(target, k);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 12));
    }
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.camLook);
    const fov = (mode === 2 ? 66 : 58) + Math.min(1, sp / this.spec.maxSpeed) * 14;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    // 陰影跟著車
    this.sun.target.position.set(c.x, 0, c.z);
    this.sun.position.set(c.x + this.sunOffset.x, this.sunOffset.y, c.z + this.sunOffset.z);
  }

  dispose() {
    Audio.stopEngine();
    this.track.dispose();
    this.model.dispose();
    this.envMap.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
  }
}

// ---------------- 失誤偵測 + 提醒 ----------------
class MistakeDetector {
  constructor(race) { this.race = race; this.resetAll(); }
  resetAll() {
    this.counts = Object.fromEntries(Object.keys(MISTAKES).map((k) => [k, 0]));
    this.total = 0;
    this.resetTimers();
  }
  resetTimers() {
    this.offTimer = 0; this.onTimer = 2; this.offArmed = true;
    this.wrongTimer = 0; this.rightTimer = 2; this.wrongArmed = true; this.wrongRepeat = 0;
    this.spinCd = 1; this.colCd = 0.5;
  }
  report(type, intensity = 1) {
    this.counts[type]++;
    this.total++;
    raiseAlert(type, intensity, this.race);
  }
  onCollision(dv) {
    if (this.race.state !== 'racing' || this.colCd > 0 || dv < 2.5) return;
    this.colCd = 1.5;
    this.report('collision', Math.max(0.6, Math.min(1.3, dv / 8)));
  }
  update(dt) {
    const r = this.race, c = r.car, t = r.track;
    this.spinCd -= dt; this.colCd -= dt;
    // 偏離賽道
    if (r.offTrack) {
      this.offTimer += dt; this.onTimer = 0;
      if (this.offArmed && this.offTimer > 0.3) { this.report('offtrack'); this.offArmed = false; }
    } else {
      this.offTimer = 0; this.onTimer += dt;
      if (this.onTimer > 1.5) this.offArmed = true;
    }
    // 逆向
    const tan = t.tangents[r.progress];
    const along = c.vx * tan.x + c.vz * tan.z;
    const facing = Math.sin(c.h) * tan.x + Math.cos(c.h) * tan.z;
    const wrong = along < -2 && facing < 0;
    if (wrong) {
      this.wrongTimer += dt; this.rightTimer = 0;
      if (this.wrongArmed && this.wrongTimer > 1.2) { this.report('wrongway'); this.wrongArmed = false; this.wrongRepeat = 0; }
      else if (!this.wrongArmed) { this.wrongRepeat += dt; if (this.wrongRepeat > 6) { this.report('wrongway'); this.wrongRepeat = 0; } }
    } else {
      this.wrongTimer = 0;
      if (along > 3) { this.rightTimer += dt; if (this.rightTimer > 1) this.wrongArmed = true; }
    }
    // 打滑
    if (this.spinCd <= 0 && c.speed > 8 && (c.slipAngle > 72 || Math.abs(c.r) > 4.2)) {
      this.report('spin');
      this.spinCd = 4;
    }
  }
}

let alertTimer = 0, edgeTimer = 0, activePriority = -1;
export function raiseAlert(type, intensity = 1, race = null) {
  const d = MISTAKES[type];
  if (Settings.visual) {
    const el = $('alert');
    if (!el.classList.contains('show') || d.priority >= activePriority) {
      activePriority = d.priority;
      $('aTitle').textContent = d.title;
      $('aTitle').style.color = d.color;
      $('aDetail').textContent = d.detail;
      el.querySelector('.abar').style.background = d.color;
      el.classList.add('show');
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => { el.classList.remove('show'); activePriority = -1; }, 2200);
      for (const id of ['edgeL', 'edgeR']) {
        const e = $(id);
        e.style.background = `linear-gradient(${id === 'edgeL' ? 90 : 270}deg, ${d.color}cc, transparent)`;
        e.style.opacity = 1;
      }
      clearTimeout(edgeTimer);
      edgeTimer = setTimeout(() => { $('edgeL').style.opacity = 0; $('edgeR').style.opacity = 0; }, 450);
    }
    if (type === 'collision' && race) race.shake = 0.6 * intensity;
  }
  if (Settings.voice) Audio.speak(d.speech, d.priority, 500 + Object.keys(MISTAKES).indexOf(type) * 90);
  if (Settings.vibration) rumble(d.rumble, Settings.vibrationStrength * intensity);
}
