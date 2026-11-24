// 比賽場景：賽道、玩家賽車、追車鏡頭、比賽流程（五燈起跑 / 計圈 / 檢查點罰時 / 完賽金幣）、
// 失誤偵測（偏離賽道、逆向、碰撞、打滑、錯過檢查點）與三種提醒（震動 / 語音 / 畫面）
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MISTAKES, PAINTS, RIVALS, getTrack } from './data.js';
import { Rival, DIFFICULTIES } from './rivals.js';
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
    const def = this.trackDef = getTrack(Settings.track);
    const night = def.time === 'night';
    // 各時段/天候：太陽仰角(極角)、方位、天空參數、霧、光色
    const TH = {
      day: { pol: 52, az: 140, sky: [3.2, 1.4, 0.004], ground: 0x3a4a2a, fog: [0xb4c4d6, 380, 2600], sun: [0xfff1dc, 2.6], hemi: [0xcfe0ff, 0x4a5a35, 0.5], env: 0.9 },
      autumn: { pol: 68, az: 215, sky: [6, 2.4, 0.006], ground: 0x5a3a1a, fog: [0xd9c3a3, 260, 2200], sun: [0xffd2a0, 2.5], hemi: [0xcfe0ff, 0x6a4a2a, 0.5], env: 0.9 },
      dusk: { pol: 83, az: 95, sky: [7, 2.8, 0.008], ground: 0x3a3028, fog: [0xd7a07a, 300, 2400], sun: [0xffa860, 2.3], hemi: [0xffc6a0, 0x40342a, 0.5], env: 0.8 },
      snow: { pol: 62, az: 160, sky: [12, 0.7, 0.01], ground: 0xc6ccd2, fog: [0xcdd5df, 160, 1500], sun: [0xeef3ff, 1.7], hemi: [0xe4ecff, 0xa8b0b8, 0.85], env: 1.0 },
      desert: { pol: 34, az: 120, sky: [4.5, 1.0, 0.005], ground: 0x9a7a4a, fog: [0xe6d4ae, 450, 2800], sun: [0xfff0d6, 3.0], hemi: [0xd8e4ff, 0x8a6a40, 0.55], env: 0.9 },
    };
    const th = TH[def.time] || TH.day;

    // 天空、太陽、霧、環境反射（依賽道時段）
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(night ? 40 : th.pol), THREE.MathUtils.degToRad(night ? 140 : th.az));
    const pmrem = new THREE.PMREMGenerator(renderer);
    if (night) {
      scene.background = new THREE.Color(0x05070d);
      this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.08;
      scene.fog = new THREE.Fog(0x070a12, 40, 420);
      // 星空
      const n = 900, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().setFromSphericalCoords(1800, Math.acos(Math.random() * 0.95), Math.random() * Math.PI * 2);
        sp.set([v.x, v.y, v.z], i * 3);
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, fog: false }));
      scene.add(stars); this.stars = stars;
    } else {
      const sky = new Sky();
      sky.scale.setScalar(4000);
      const u = sky.material.uniforms;
      [u.turbidity.value, u.rayleigh.value, u.mieCoefficient.value] = th.sky; u.mieDirectionalG.value = 0.85;
      u.sunPosition.value.copy(sunDir);
      scene.add(sky);
      const envScene = new THREE.Scene();
      const sky2 = new Sky(); sky2.scale.setScalar(1000);
      Object.assign(sky2.material.uniforms.sunPosition.value, sunDir);
      for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
      envScene.add(sky2);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: th.ground }));
      ground.position.y = -2;
      envScene.add(ground);
      this.envMap = pmrem.fromScene(envScene, 0.02).texture;
      scene.environmentIntensity = th.env;
      scene.fog = new THREE.Fog(...th.fog);
    }
    scene.environment = this.envMap;
    pmrem.dispose();

    const sun = this.sun = new THREE.DirectionalLight(night ? 0x8fa6ff : th.sun[0], night ? 0.35 : th.sun[1]);
    sun.position.copy(sunDir).multiplyScalar(120);
    sun.castShadow = quality !== 'low';
    const ss = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(ss, ss);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sunOffset = sunDir.clone().multiplyScalar(150);
    scene.add(night ? new THREE.HemisphereLight(0x34406a, 0x0a0c10, 0.25) : new THREE.HemisphereLight(...th.hemi));
    if (def.time === 'snow') {
      // 飄雪：跟著鏡頭的粒子盒
      const n = quality === 'low' ? 900 : 2200, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) sp.set([(Math.random() - 0.5) * 80, Math.random() * 40, (Math.random() - 0.5) * 80], i * 3);
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snow.frustumCulled = false;
      scene.add(this.snow);
    }

    this.track = new Track(scene, { quality, def });

    // 玩家賽車
    const spec = this.spec = Profile.selectedCar();
    this.model = buildCar(spec, PAINTS[Profile.paintOf(spec)], { shadows: quality !== 'low' });
    scene.add(this.model.root);
    this.car = new CarPhysics(spec);
    if (night) {
      // 車頭燈
      const head = new THREE.SpotLight(0xfff4e0, 220, 160, 0.5, 0.55, 1.3);
      head.position.set(0, 0.75, spec.frontZ - 0.3);
      head.target.position.set(0, 0, spec.frontZ + 30);
      head.castShadow = false;
      this.model.root.add(head, head.target);
      const fill = new THREE.PointLight(0xffe8d0, 6, 12, 1.5);
      fill.position.set(0, 1.2, spec.frontZ + 3);
      this.model.root.add(fill);
    }
    this.road = { y: 0, gx: 0, gz: 0 };

    camera.near = 0.1; camera.far = 5000; camera.fov = 60;
    camera.updateProjectionMatrix();
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shake = 0;

    // 電腦對手
    const diffKey = DIFFICULTIES[Settings.difficulty] ? Settings.difficulty : 'normal';
    this.diffKey = diffKey;
    const nOpp = Math.max(0, Math.min(5, Settings.opponents ?? 3));
    // 衛冕冠軍只在困難出場；其餘依賽道輪替
    const pool = RIVALS.filter((r) => diffKey === 'hard' || r.id !== 'kai');
    const rot = def.id.length % pool.length;
    const picks = [...pool.slice(rot), ...pool.slice(0, rot)];
    if (diffKey === 'hard') picks.sort((a, b) => (b.id === 'kai') - (a.id === 'kai'));
    this.rivals = picks.slice(0, nOpp).map((who, k) => new Rival(who, spec, diffKey, this.track, quality, k + 1));
    for (const r of this.rivals) scene.add(r.model.root);

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
    // 起跑格：對手在前，玩家在最後一格
    const n = this.rivals.length, hwG = this.track.halfWidth * 0.45;
    const slot = (k) => ({ off: 8 + k * 5, lat: n ? (k % 2 === 0 ? -hwG : hwG) : 0 });
    this.rivals.forEach((r, k) => {
      const s = slot(k);
      r.place(this.track.wrap(-s.off), s.lat);
      r.adv = -s.off; r.finishTime = -1; r.bestLap = -1; r.lapStartT = 0; r.lapStarted = false;
    });
    const ps = slot(n);
    this.progress = this.track.wrap(-ps.off);
    this.adv = -ps.off;
    this.position = n + 1;
    this.placeCarAt(this.progress, ps.lat);
    this.snapCamera();
    $('finish').classList.remove('show');
    Audio.startEngine(this.spec.enginePitch);
  }

  placeCarAt(idx, lateral = 0) {
    const p = this.track.points[idx], t = this.track.tangents[idx], r = this.track.rights[idx];
    this.car.reset(p.x + r.x * lateral, p.z + r.z * lateral, Math.atan2(t.x, t.z));
    this.applyRoad(idx);
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
      for (const r of this.rivals) {
        r.car.step(h, { throttle: enabled ? r.throttle : 0, brake: enabled ? r.brake : 1, handbrake: false, enabled });
        const { index } = this.track.findNearest(r.car.x, r.car.z, r.progress, 30);
        r.applyRoad(index);
        this.wallCollide(r.car, r.spec, index);
      }
      this.carContacts();
      this.accum -= h;
    }
    this.updateProgress();
    this.updateRivals(dt, enabled);
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
    let dIdx = t.wrap(index - this.progress); if (dIdx > t.count / 2) dIdx -= t.count;
    if (this.state === 'racing') this.adv += dIdx;
    this.progress = index;
    this.lateralPos = t.lateral(c.x, c.z, index);
    const abs = Math.abs(this.lateralPos);
    c.offTrack = abs > t.halfWidth + t.curbWidth;
    this.offTrack = abs > t.halfWidth + t.curbWidth + 0.2;
  }

  /** 對手：決策、進度、完賽、卡住重置；並計算即時名次 */
  updateRivals(dt, enabled) {
    const t = this.track, n = t.count;
    if (!this.rivals.length) return;
    const all = [this.car, ...this.rivals.map((r) => r.car)];
    const prog = [this.progress, ...this.rivals.map((r) => r.progress)];
    const info = all.map((c, k) => ({ x: c.x, z: c.z, vx: c.vx, vz: c.vz, progress: prog[k], lat: t.lateral(c.x, c.z, prog[k]) }));
    this.rivals.forEach((r, k) => {
      const others = info.filter((_, j) => j !== k + 1);
      // 輕微的追趕平衡：落後玩家太多就稍微加速，領先太多就稍微放慢
      const gap = (this.adv - r.adv) * t.spacing;
      const rubber = this.state === 'racing' ? 1 + Math.max(r.diff.rubber[0], Math.min(r.diff.rubber[1], gap / 3000)) : 1;
      r.think(dt, others, this.raceTime, rubber);
      r.car.updateSteer(dt, enabled ? r.steer : 0);
      const { index, sqr } = t.findNearest(r.car.x, r.car.z, r.progress, 60);
      let idx = index;
      if (sqr > 45 * 45) idx = t.findNearest(r.car.x, r.car.z).index;
      let dIdx = t.wrap(idx - r.progress); if (dIdx > n / 2) dIdx -= n;
      r.progress = idx;
      r.car.offTrack = Math.abs(t.lateral(r.car.x, r.car.z, idx)) > t.halfWidth + t.curbWidth;
      if (this.state === 'racing' && r.finishTime < 0) {
        const lapBefore = Math.floor(r.adv / n);
        r.adv += dIdx;
        const lapAfter = Math.floor(r.adv / n);
        if (lapAfter > lapBefore && lapAfter >= 1) {
          // 跨過終點線：記錄單圈（第一次跨線是起跑，不計）
          const lt = this.raceTime - r.lapStartT; r.lapStartT = this.raceTime;
          if (r.lapStarted && (r.bestLap < 0 || lt < r.bestLap)) r.bestLap = lt;
          r.lapStarted = true;
        }
        if (lapBefore < 0 && r.adv >= 0) { r.lapStartT = this.raceTime; r.lapStarted = true; }
        if (r.adv >= this.totalLaps * n) r.finishTime = this.raceTime;
        if (r.stuck > 3) { r.place(t.wrap(idx + 2), 0); }
      }
      r.car.applyVisual(r.model);
      r.model.setBrake(r.brake > 0.1 || !enabled);
    });
    if (this.state !== 'finished') this.position = this.rankOf(this.adv);
  }
  rankOf(adv) {
    let pos = 1;
    for (const r of this.rivals) if (r.finishTime >= 0 || r.adv > adv) pos++;
    return pos;
  }

  /** 車與車碰撞：每台車用前後兩個圓近似 */
  carContacts() {
    const cars = [{ c: this.car, s: this.spec, me: true }, ...this.rivals.map((r) => ({ c: r.car, s: r.spec }))];
    if (cars.length < 2) return;
    const circles = (o) => {
      const c = o.c, r = o.s.maxHalfWidth * 0.92, off = Math.max(0, o.s.length / 2 - r);
      return [[c.x + c.fx * off, c.z + c.fz * off, r], [c.x - c.fx * off, c.z - c.fz * off, r]];
    };
    for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
      const A = cars[a], B = cars[b];
      if ((A.c.x - B.c.x) ** 2 + (A.c.z - B.c.z) ** 2 > 64) continue;
      let best = null;
      for (const p of circles(A)) for (const q of circles(B)) {
        const dx = q[0] - p[0], dz = q[1] - p[1], d = Math.hypot(dx, dz), min = p[2] + q[2];
        if (d < min && d > 1e-4 && (!best || min - d > best.pen)) best = { nx: dx / d, nz: dz / d, pen: min - d };
      }
      if (!best) continue;
      const { nx, nz, pen } = best;
      A.c.x -= nx * pen / 2; A.c.z -= nz * pen / 2;
      B.c.x += nx * pen / 2; B.c.z += nz * pen / 2;
      const vrel = (B.c.vx - A.c.vx) * nx + (B.c.vz - A.c.vz) * nz;
      if (vrel >= 0) continue;
      const j = -vrel * 0.6;
      A.c.vx -= nx * j; A.c.vz -= nz * j;
      B.c.vx += nx * j; B.c.vz += nz * j;
      A.c.r *= 0.8; B.c.r *= 0.8;
      if (A.me && this.state === 'racing') {
        if (j > 1.5) Audio.impact(Math.min(1, j / 8));
        // 只有玩家撞上前車（接觸點在車頭方向）才算失誤；被後車撞不算
        if (nx * A.c.fx + nz * A.c.fz > 0.5) this.detector.onCollision(j * 2);
      }
    }
  }

  applyRoad(index) {
    const c = this.car;
    this.track.roadAt(c.x, c.z, index, this.road);
    c.y = this.road.y; c.gx = this.road.gx; c.gz = this.road.gz;
  }

  collide() {
    const c = this.car, t = this.track;
    const { index } = t.findNearest(c.x, c.z, this.progress, 30);
    this.applyRoad(index);
    const dv = this.wallCollide(c, this.spec, index);
    if (dv > 1.5) Audio.impact(Math.min(1, dv / 10));
    if (dv > 0) this.detector.onCollision(dv);
  }
  /** 護欄 / 柱子碰撞（玩家與對手共用），回傳撞擊速度變化 */
  wallCollide(c, spec, index) {
    const t = this.track;
    const lat = t.lateral(c.x, c.z, index);
    const r = t.rights[index];
    const hw = spec.maxHalfWidth * 0.95;
    // 車身兩端（前後）都要檢查，用車長的一半估算車頭方向在側向的延伸
    const ext = Math.abs(Math.sin(c.h - Math.atan2(t.tangents[index].x, t.tangents[index].z))) * spec.length * 0.5;
    const reach = hw + ext * 0.9;
    let dv = 0;
    if (lat + reach > t.rightBarrier[index]) dv = c.collide(-r.x, -r.z, lat + reach - t.rightBarrier[index]);
    else if (lat - reach < -t.leftBarrier[index]) dv = c.collide(r.x, r.z, -t.leftBarrier[index] - (lat - reach));
    for (const o of t.obstacles) {
      const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz), min = o.r + hw;
      if (d < min && d > 1e-3) dv = Math.max(dv, c.collide(dx / d, dz / d, min - d));
    }
    return dv;
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
    const total = this.raceTime + this.penalty;
    // 最終名次：已完賽的對手依時間排，其餘依進度
    const rows = [{ name: '你', me: true, time: total, adv: Infinity, car: this.spec.name }];
    for (const r of this.rivals) rows.push({ name: r.name, title: r.who.title, time: r.finishTime, adv: r.adv, car: r.spec.name });
    rows.sort((a, b) => {
      const fa = a.time >= 0, fb = b.time >= 0;
      if (fa && fb) return a.time - b.time;
      if (fa !== fb) return fa ? -1 : 1;
      return b.adv - a.adv;
    });
    const rank = rows.findIndex((r) => r.me) + 1;
    this.position = rank;
    const hasOpp = this.rivals.length > 0;
    const diff = DIFFICULTIES[this.diffKey];
    const placeMul = hasOpp ? [1.6, 1.25, 1.0, 0.85, 0.75, 0.7][rank - 1] : 1;
    let coins = 400 + 150 * this.totalLaps + 250 * this.cleanLaps + (this.detector.total === 0 ? 500 : 0);
    coins = Math.round(coins * (this.trackDef.reward || 1) * placeMul * (hasOpp ? diff.reward : 1) / 10) * 10;
    const win = hasOpp && rank === 1 && Profile.recordWin(this.trackDef.id, this.diffKey);
    this.rank = rank;
    if (Profile.vip) coins *= 2;
    const record = this.bestLap > 0 && Profile.recordLap(this.trackDef.id, this.bestLap);
    this.coins = coins;
    Profile.addCoins(coins);
    const d = this.detector;
    const mis = Object.keys(MISTAKES).filter((k) => d.counts[k]).map((k) => `${MISTAKES[k].name} ×${d.counts[k]}`).join('　');
    const medal = ['🥇', '🥈', '🥉'];
    const table = hasOpp ? `<div class="ranking">${rows.map((r, i) => `<div class="rk${r.me ? ' me' : ''}"><b>${medal[i] || (i + 1)}</b><span>${r.name}${r.title ? `<small>${r.title}</small>` : ''}</span><em>${r.time >= 0 ? formatTime(r.time) : '未完賽'}</em></div>`).join('')}</div>` : '';
    const html = `
      ${hasOpp ? `<div class="place">${rank === 1 ? '冠軍！' : `第 ${rank} 名`}<small>${diff.name}・${this.rivals.length} 位對手</small></div>` : ''}
      ${win ? '<div style="color:#ffd24d"><b>🏆 取得這條賽道的勝利紀錄！</b></div>' : ''}
      ${table}
      <div class="total">${formatTime(total)}</div>
      ${this.penalty > 0 ? `<div style="color:#c99bff">（含罰時 +${this.penalty.toFixed(1)} 秒）</div>` : ''}
      <div>最佳單圈　${formatTime(this.bestLap)}${record ? '　<b style="color:#ffd24d">賽道新紀錄！</b>' : ''}</div>
      <div class="dim" style="font-size:13px">${this.trackDef.name}　·　賽道紀錄 ${formatTime(Profile.bestLap(this.trackDef.id))}</div>
      <div class="dim" style="font-size:13px">${this.lapTimes.map((t, i) => `第 ${i + 1} 圈 ${formatTime(t)}`).join('　')}</div>
      <div style="margin-top:6px"><b>失誤統計：共 ${d.total} 次</b></div>
      <div style="font-size:13px">${mis || '<span style="color:#3ee07f">零失誤，完美駕駛！</span>'}</div>
      <div class="reward"><span class="coin"></span>獲得金幣 +${coins.toLocaleString()}${this.trackDef.reward > 1 ? `（賽道 ×${this.trackDef.reward}）` : ''}${hasOpp ? `（名次 ×${placeMul}・${diff.name} ×${diff.reward}）` : ''}${Profile.vip ? '（VIP ×2）' : ''}</div>
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
    const y = c.y, gF = c.gx * fx + c.gz * fz;
    if (mode === 2) {
      target = new THREE.Vector3(c.x + fx * 0.3, y + 1.12 + gF * 0.3, c.z + fz * 0.3);
      look = new THREE.Vector3(c.x + fx * 20, y + 0.9 + gF * 20, c.z + fz * 20);
    } else {
      const dist = mode === 0 ? 6.2 : 9.5, height = mode === 0 ? 2.0 : 3.1;
      target = new THREE.Vector3(c.x - dx * dist, y + height - gF * dist * 0.6, c.z - dz * dist);
      look = new THREE.Vector3(c.x + fx * 3, y + 0.9 + gF * 3, c.z + fz * 3);
    }
    if (snap || mode === 2) { this.camPos.copy(target); this.camLook.copy(look); }
    else {
      const k = 1 - Math.exp(-dt * 7);
      this.camPos.lerp(target, k);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 12));
    }
    cam.position.copy(this.camPos);
    if (this.track.mountain && mode !== 2) {
      // 別讓鏡頭鑽進山壁
      const g = this.track.groundAt(cam.position.x, cam.position.z) + 1.0;
      if (cam.position.y < g) { cam.position.y = g; this.camPos.y = g; }
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.camLook);
    const fov = (mode === 2 ? 66 : 58) + Math.min(1, sp / this.spec.maxSpeed) * 14;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
    // 陰影跟著車
    this.sun.target.position.set(c.x, c.y, c.z);
    this.sun.position.set(c.x + this.sunOffset.x, c.y + this.sunOffset.y, c.z + this.sunOffset.z);
    if (this.stars) this.stars.position.set(cam.position.x, 0, cam.position.z);
    if (this.snow) {
      const a = this.snow.geometry.getAttribute('position'), p = a.array, o = this.snow.position;
      o.set(cam.position.x, cam.position.y - 15, cam.position.z);
      const t = performance.now() * 0.001;
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] -= dt * (2.2 + (i % 7) * 0.25);
        p[i] += Math.sin(t + i) * dt * 0.6;
        if (p[i + 1] < 0) p[i + 1] += 40;
      }
      a.needsUpdate = true;
    }
  }

  dispose() {
    Audio.stopEngine();
    this.track.dispose();
    this.model.dispose();
    for (const r of this.rivals) r.model.dispose();
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
