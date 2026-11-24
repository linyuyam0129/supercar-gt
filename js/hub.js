// 聯賽園區（主選單世界）：主角在賽車場維修區走動，靠近車庫 / 報名處 / 商店 / NPC 互動
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAINTS, getCar } from './data.js';
import { Profile } from './store.js';
import { buildCar } from './carModel.js';
import { makeCharacter, makeLabel } from './character.js';
import { NPCS, WORLD, winStats } from './story.js';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';

// 可走範圍與主角起點
const BOUNDS = { x0: -41, x1: 41, z0: -20.6, z1: 31 };
const SPAWN = { x: -12, z: -8, h: Math.PI };

export class Hub {
  constructor(renderer, camera, quality) {
    this.renderer = renderer;
    this.camera = camera;
    this.quality = quality;
    const scene = this.scene = new THREE.Scene();
    this.disposables = [];
    this.time = 0;

    // ---- 天空與光線（傍晚的金色陽光）----
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(66), THREE.MathUtils.degToRad(210));
    const sky = new Sky(); sky.scale.setScalar(3000);
    const u = sky.material.uniforms;
    u.turbidity.value = 5; u.rayleigh.value = 1.8; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(sunDir);
    scene.add(sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    sky2.material.uniforms.sunPosition.value.copy(sunDir);
    envScene.add(sky2);
    this.env = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
    scene.environment = this.env;
    scene.environmentIntensity = 0.85;
    scene.fog = new THREE.Fog(0xd8c4a8, 120, 600);
    const sun = this.sun = new THREE.DirectionalLight(0xffe2bf, 2.6);
    sun.castShadow = quality !== 'low';
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.sunOffset = sunDir.clone().multiplyScalar(80);
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a5040, 0.55));

    this.colliders = []; // { x, z, hx, hz } 軸對齊方塊，或 { x, z, r } 圓
    this.spots = [];     // 可互動點 { id, kind, x, z, r, label, prompt }
    this.buildGround();
    this.buildPitBuilding();
    this.buildRaceDesk();
    this.buildShop();
    this.buildGrandstand();
    this.buildProps();
    this.buildCars();
    this.buildNpcs();

    // ---- 主角 ----
    this.hero = makeCharacter({ suit: 0xd8262b, suit2: 0xffffff, hair: 0x1d1612, hairStyle: 'short' });
    scene.add(this.hero.root);
    this.px = SPAWN.x; this.pz = SPAWN.z; this.ph = SPAWN.h; this.pv = 0;
    this.camYaw = 0.35; this.camPos = new THREE.Vector3(); this.snap = true;
    this.near = null;
  }

  // ---------------- 場景 ----------------
  add(mesh, { cast = true, receive = true, collide = false } = {}) {
    mesh.castShadow = cast && this.quality !== 'low';
    mesh.receiveShadow = receive;
    this.scene.add(mesh);
    // 立體物件都會擋鏡頭（地面平面除外）
    if (mesh.geometry && mesh.geometry.type === 'BoxGeometry') (this.camBlockers ||= []).push(mesh);
    if (collide) {
      mesh.updateMatrixWorld();
      const b = new THREE.Box3().setFromObject(mesh);
      this.colliders.push({ x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2, hx: (b.max.x - b.min.x) / 2, hz: (b.max.z - b.min.z) / 2 });
    }
    return mesh;
  }
  box(w, h, d, x, y, z, mat, opt) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return this.add(m, opt);
  }

  buildGround() {
    const asphalt = canvasTex(512, 512, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const v = 58 + Math.random() * 26; img.data.set([v, v, v + 3, 255], i * 4); }
      g.putImageData(img, 0, 0);
    });
    asphalt.repeat.set(30, 24);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.85 }));
    this.add(ground, { cast: false });
    // 地面標線：停車格、行人道、中央聯賽標誌
    const paint = canvasTex(1024, 1024, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const s = w / 90; // 90 m 寬
      const X = (x) => (x + 45) * s, Z = (z) => (z + 35) * s;
      g.strokeStyle = 'rgba(245,245,240,0.85)'; g.lineWidth = 0.15 * s;
      // 車庫前的黃色停車區
      g.strokeStyle = 'rgba(255,200,40,0.9)';
      for (const x of [-19.5, -6.5, 6.5, 19.5]) g.strokeRect(X(x - 3.8), Z(-21.5), 7.6 * s, 6 * s);
      // 斑馬線
      g.fillStyle = 'rgba(240,240,235,0.8)';
      for (let i = 0; i < 9; i++) g.fillRect(X(-4 + i * 1), Z(4), 0.5 * s, 5 * s);
      // 中央圓形標誌
      g.strokeStyle = 'rgba(255,80,60,0.85)'; g.lineWidth = 0.35 * s;
      g.beginPath(); g.arc(X(0), Z(-6), 7 * s, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 0.12 * s; g.beginPath(); g.arc(X(0), Z(-6), 6.2 * s, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `bold ${2.2 * s}px ${FONT}`; g.fillText('DAWNBAY', X(0), Z(-7.1));
      g.font = `bold ${1.1 * s}px ${FONT}`; g.fillText('SPEED LEAGUE', X(0), Z(-4.8));
      // 對手車停車格
      g.strokeStyle = 'rgba(245,245,240,0.85)'; g.lineWidth = 0.15 * s;
      for (const [x, z] of [[12, 15], [-16, 13]]) g.strokeRect(X(x - 1.6), Z(z - 3), 3.2 * s, 6 * s);
    }, false);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: paint, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    decal.position.y = 0.01;
    this.add(decal, { cast: false });
    // 草地外圈與樹
    const grass = new THREE.MeshStandardMaterial({ color: 0x4f6e2c, roughness: 0.95 });
    for (const [w, d, x, z] of [[240, 30, 0, 52], [40, 120, -63, -10], [40, 120, 63, 0]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), grass);
      g.position.set(x, 0.015, z); this.add(g, { cast: false });
    }
  }

  buildPitBuilding() {
    const wall = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.08, metalness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc81f25, roughness: 0.5 });
    // 主體（前方立面在 z = -22）
    this.box(60, 4, 12, 0, 8, -28, wall);
    this.box(60, 0.5, 13, 0, 10.2, -27.5, red);
    this.box(58, 2.6, 0.2, 0, 7.6, -21.9, glass, { cast: false });
    // 四個車庫門（1 號打開）
    const bays = [-19.5, -6.5, 6.5, 19.5];
    for (let k = 0; k < 4; k++) {
      const x = bays[k];
      this.box(3, 6, 12, x + 6.5, 3, -28, wall); // 隔牆
      if (k === 0) {
        // 打開的 1 號車庫：深色內部 + 白色燈條
        this.box(10, 0.3, 12, x, 6.15, -28, wall);
        this.box(10, 6, 0.3, x, 3, -33.9, new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.7 }));
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        strip.rotation.x = Math.PI / 2; strip.position.set(x, 5.95, -27.5); this.scene.add(strip);
        const lamp = new THREE.PointLight(0xfff4e6, 30, 14, 1.6); lamp.position.set(x, 5, -27); this.scene.add(lamp);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 12).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.35, metalness: 0.2 }));
        floor.position.set(x, 0.02, -28); this.add(floor, { cast: false });
        // 工具櫃
        this.box(3, 1.2, 0.7, x - 3, 0.6, -33.3, red);
        this.box(2, 2.2, 0.7, x + 3.2, 1.1, -33.3, new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.5 }));
      } else {
        const door = canvasTex(256, 160, (g, w, h) => {
          g.fillStyle = '#9ea4ab'; g.fillRect(0, 0, w, h);
          for (let y = 0; y < h; y += 10) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 2); }
          g.fillStyle = '#1b1d22'; g.font = `bold 36px ${FONT}`; g.textAlign = 'center'; g.fillText(`0${k + 1}`, w / 2, 70);
        }, false);
        this.box(10, 6, 0.3, x, 3, -22.4, new THREE.MeshStandardMaterial({ map: door, roughness: 0.5, metalness: 0.4 }));
        this.box(10, 6, 11.4, x, 3, -28.4, dark, { cast: false });
      }
    }
    this.box(3, 6, 12, -27.5, 3, -28, wall);
    this.box(3, 6, 12, 27.5, 3, -28, wall);
    // 招牌
    const sign = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#0d0f14'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff4a3a'; g.fillRect(0, h - 10, w, 10);
      g.fillStyle = '#fff'; g.font = `bold 62px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${WORLD.league}　DAWNBAY SPEED LEAGUE`, w / 2, h / 2 - 4);
    }, false);
    this.box(34, 4.2, 0.4, 0, 12.6, -22.2, new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.6, roughness: 0.5 }));
    // 戰績板（車庫立面上方）
    const st = winStats();
    const board = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#121620'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffd24d'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffd24d'; g.font = `bold 44px ${FONT}`; g.textAlign = 'center';
      g.fillText('🏆 聯賽戰績', w / 2, 70);
      g.fillStyle = '#fff'; g.font = `38px ${FONT}`;
      g.fillText(`勝利賽道 ${st.wins} / ${st.total}`, w / 2, 140);
      g.fillStyle = '#ff8a7a'; g.fillText(`困難制霸 ${st.hard} / ${st.total}`, w / 2, 200);
    }, false);
    this.box(6, 3, 0.2, 13, 7.6, -21.7, new THREE.MeshStandardMaterial({ map: board, emissive: 0xffffff, emissiveMap: board, emissiveIntensity: 0.45 }), { cast: false });
    // 碰撞：整棟建築
    this.colliders.push({ x: 0, z: -28.4, hx: 30, hz: 6.2 });
    this.spot('garage', 'station', -19.5, -19, 3.2, '車庫', 'GARAGE 01', '進入車庫', '#5aa2ff', 6.8);
  }

  buildRaceDesk() {
    // 東側：報名處 + 通往賽道的起跑拱門
    const x0 = 30;
    const white = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc81f25, roughness: 0.5 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.75 });
    this.box(1.2, 1.1, 6, x0, 0.55, 0, white, { collide: true });
    this.box(1.4, 0.08, 6.2, x0, 1.14, 0, red);
    for (const z of [-3.4, 3.4]) this.box(0.15, 3.4, 0.15, x0 + 1.4, 1.7, z, metal);
    this.box(3.6, 0.15, 7.4, x0 + 1, 3.45, 0, red);
    // 拱門與賽道
    const gate = canvasTex(1024, 128, (g, w, h) => {
      for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) { g.fillStyle = ((x + y) / 32) % 2 ? '#111' : '#eee'; g.fillRect(x, y, 32, 32); }
      g.fillStyle = 'rgba(200,20,30,0.92)'; g.fillRect(160, 16, w - 320, h - 32);
      g.fillStyle = '#fff'; g.font = `bold 60px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('ENTRY · 賽事報名', w / 2, h / 2 + 2);
    }, false);
    for (const z of [-9, 9]) this.box(1, 9, 1, 39, 4.5, z, metal, { collide: true });
    this.box(1.2, 2.2, 19, 39, 9.4, 0, new THREE.MeshStandardMaterial({ map: gate, roughness: 0.5 }));
    const road = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2c2d30'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#eee'; g.fillRect(0, 10, w, 8); g.fillRect(0, h - 18, w, 8);
    });
    road.repeat.set(10, 1);
    const tr = new THREE.Mesh(new THREE.PlaneGeometry(120, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: road, roughness: 0.8 }));
    tr.position.set(100, 0.02, 0); this.add(tr, { cast: false });
    const curb = canvasTex(64, 16, (g, w, h) => { g.fillStyle = '#eee'; g.fillRect(0, 0, w, h); g.fillStyle = '#c01410'; g.fillRect(0, 0, w / 2, h); });
    curb.repeat.set(60, 1);
    for (const z of [-8.6, 8.6]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(120, 1.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: curb, roughness: 0.6 }));
      c.position.set(100, 0.03, z); this.add(c, { cast: false });
    }
    // 拱門外有柵欄擋住（只能在報名處報名）
    this.colliders.push({ x: 40, z: 0, hx: 0.6, hz: 10 });
    this.spot('race', 'npc-station', x0 - 2.2, 0, 3.2, '賽事報名', '找老周報名比賽', '報名比賽', '#ffd24d', 4.4, 'zhou');
  }

  buildShop() {
    const x0 = -31, z0 = 4;
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
    this.box(4, 3, 6, x0 - 1, 1.5, z0, white, { collide: true });
    this.box(1.2, 1.1, 6, x0 + 1.6, 0.55, z0, wood, { collide: true });
    const awn = canvasTex(256, 64, (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#f5f5f0' : '#e2a40e'; g.fillRect(x, 0, 32, h); } });
    const a = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 6.6), new THREE.MeshStandardMaterial({ map: awn, roughness: 0.7 }));
    a.position.set(x0 + 1.6, 3.2, z0); a.rotation.z = -0.25; this.add(a);
    const neon = canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = '#0b0d12'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd24d'; g.font = `bold 84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ffb000'; g.shadowBlur = 24; g.fillText('SHOP 商店', w / 2, h / 2);
    }, false);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.6), new THREE.MeshStandardMaterial({ map: neon, emissive: 0xffffff, emissiveMap: neon, emissiveIntensity: 1.1 }));
    s.position.set(x0 + 1.05, 4.4, z0); s.rotation.y = Math.PI / 2; this.scene.add(s);
    // 金幣看板
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.9, roughness: 0.25 }));
      c.rotation.z = Math.PI / 2; c.position.set(x0 + 1.6, 1.6, z0 - 1.6 + i * 1.6); this.scene.add(c);
      (this.coins ||= []).push(c);
    }
    this.spot('shop', 'station', x0 + 4.2, z0, 3, '課金商店', 'SHOP', '進入商店', '#ffd24d', 4.6);
  }

  buildGrandstand() {
    // 南側看台（面向園區）
    const conc = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 });
    const seatCols = [0xc81f25, 0x2f6fd6, 0xf0f0ea];
    for (let r = 0; r < 6; r++) {
      this.box(46, 0.6 + r * 0.6, 1.6, -4, (0.6 + r * 0.6) / 2, 33 + r * 1.6, conc);
      const seats = new THREE.Mesh(new THREE.BoxGeometry(44, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: seatCols[r % 3], roughness: 0.6 }));
      seats.position.set(-4, 0.75 + r * 0.6, 33.2 + r * 1.6); this.add(seats);
    }
    this.colliders.push({ x: -4, z: 37, hx: 23.2, hz: 5 });
    // 大螢幕
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.75 });
    this.box(0.6, 9, 0.6, 26, 4.5, 30, metal, { collide: true });
    const scr = canvasTex(512, 288, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#16213a'); gr.addColorStop(1, '#3a1220');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = `bold 46px ${FONT}`; g.textAlign = 'center';
      g.fillText('NEXT RACE', w / 2, 90);
      g.fillStyle = '#ffd24d'; g.font = `bold 60px ${FONT}`; g.fillText('新人挑戰賽', w / 2, 170);
      g.fillStyle = '#9fb0d0'; g.font = `30px ${FONT}`; g.fillText('報名處受理中', w / 2, 230);
    }, false);
    const sm = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.4), [metal, metal, metal, metal, metal, new THREE.MeshStandardMaterial({ map: scr, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: 0.9 })]);
    sm.position.set(26, 10, 30); sm.rotation.y = Math.PI + 0.35; this.add(sm);
  }

  buildProps() {
    // 燈柱、旗幟、樹、輪胎堆、交通錐
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 1.5 });
    for (const [x, z] of [[-36, -14], [-36, 16], [34, -14], [34, 16], [0, 24], [-20, 24]]) {
      this.box(0.25, 7, 0.25, x, 3.5, z, metal);
      this.box(1.4, 0.2, 0.5, x, 7, z, lampM, { cast: false });
      this.colliders.push({ x, z, r: 0.4 });
    }
    this.flags = [];
    const flagCols = ['#c81f25', '#2f6fd6', '#ffd24d', '#1f9a5a'];
    for (let i = 0; i < 8; i++) {
      const x = -34 + i * 9.5, z = 27;
      this.box(0.12, 6, 0.12, x, 3, z, metal);
      const tex = canvasTex(64, 32, (g, w, h) => { g.fillStyle = flagCols[i % 4]; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, h * 0.4, w, h * 0.2); }, false);
      const geo = new THREE.PlaneGeometry(1.8, 1, 8, 1); geo.translate(0.9, 0, 0);
      const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
      f.position.set(x + 0.06, 5.4, z); this.add(f, { cast: false });
      f.userData.base = geo.attributes.position.array.slice();
      f.userData.seed = i;
      this.flags.push(f);
    }
    // 輪胎堆
    const tireM = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
    const tireG = new THREE.TorusGeometry(0.42, 0.2, 10, 20).rotateX(Math.PI / 2);
    for (const [x, z, n] of [[-37, -4, 4], [-37, -1, 3], [36, 12, 4], [2, -19.5, 3]]) {
      for (let k = 0; k < n; k++) { const t = new THREE.Mesh(tireG, tireM); t.position.set(x, 0.2 + k * 0.38, z); this.add(t); }
      this.colliders.push({ x, z, r: 0.75 });
    }
    // 交通錐
    const coneM = new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.6 });
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 12), coneM); c.position.set(22 + i * 2.4, 0.35, -12); this.add(c); }
    // 樹（外圍）
    const trunk = new THREE.CylinderGeometry(0.15, 0.25, 3, 6); trunk.translate(0, 1.5, 0);
    const crown = new THREE.IcosahedronGeometry(1.8, 1); crown.translate(0, 4, 0);
    const tm = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.9 });
    const cm = new THREE.MeshStandardMaterial({ color: 0x3f6a26, roughness: 0.9, flatShading: true });
    const pos = [];
    for (let i = 0; i < 36; i++) {
      const side = i % 3;
      const x = side === 0 ? -48 - Math.random() * 20 : side === 1 ? 48 + Math.random() * 20 : -60 + Math.random() * 120;
      const z = side === 2 ? 48 + Math.random() * 15 : -15 + Math.random() * 60;
      pos.push([x, z, 0.8 + Math.random() * 0.6]);
    }
    for (const [geo, m] of [[trunk, tm], [crown, cm]]) {
      const im = new THREE.InstancedMesh(geo, m, pos.length);
      const mt = new THREE.Matrix4();
      pos.forEach(([x, z, s], i) => im.setMatrixAt(i, mt.makeScale(s, s, s).setPosition(x, 0, z)));
      im.castShadow = this.quality !== 'low';
      this.scene.add(im);
    }
    // 遠處山丘
    const hills = new THREE.Mesh(new THREE.ConeGeometry(120, 40, 7), new THREE.MeshStandardMaterial({ color: 0x5c6b48, roughness: 1, flatShading: true }));
    hills.position.set(-140, 18, -180); this.scene.add(hills);
    const h2 = hills.clone(); h2.scale.set(1.3, 1.4, 1); h2.position.set(90, 24, -210); this.scene.add(h2);
  }

  buildCars() {
    this.carModels = [];
    const put = (spec, paint, x, z, h) => {
      const m = buildCar(spec, PAINTS[paint], { shadows: this.quality !== 'low' });
      m.root.position.set(x, 0, z); m.root.rotation.y = h;
      m.setBrake?.(false);
      this.scene.add(m.root);
      this.carModels.push(m);
      // 用兩個圓當碰撞
      const fx = Math.sin(h), fz = Math.cos(h), off = spec.length / 2 - spec.maxHalfWidth;
      for (const s of [-1, 1]) this.colliders.push({ x: x + fx * off * s, z: z + fz * off * s, r: spec.maxHalfWidth + 0.15 });
      return m;
    };
    const mine = Profile.selectedCar();
    put(mine, Profile.paintOf(mine), -19.5, -27.5, 0);           // 1 號車庫裡的愛車（車頭朝外）
    put(getCar('nordvind'), 3, 12, 15, Math.PI);                 // 凱的黑色超跑
    put(getCar('tempesta'), 5, -16, 13, Math.PI);                // 小葵的車
  }

  buildNpcs() {
    this.npcs = [];
    const place = (id, x, z, h) => {
      const d = NPCS[id];
      const c = makeCharacter(d.look);
      c.root.position.set(x, 0, z); c.root.rotation.y = h;
      this.scene.add(c.root);
      const lab = makeLabel(d.name, d.title, d.color, 0.8);
      lab.position.set(0, 2.35 * (d.look.height || 1), 0); c.root.add(lab);
      this.npcs.push({ id, c, x, z, h0: h });
      this.colliders.push({ x, z, r: 0.45 });
      return c;
    };
    place('rin', -14.6, -18.6, -0.5);
    place('zhou', 31.6, 0, -Math.PI / 2);
    place('kai', 9.2, 15, -Math.PI / 2 - 0.3);
    place('aoi', -12.8, 12.6, Math.PI / 2 + 0.4);
    this.spot('rin', 'npc', -14.6, -18.6, 2.2, null, null, '和小鈴說話', NPCS.rin.color);
    this.spot('kai', 'npc', 9.2, 15, 2.4, null, null, '和凱說話', NPCS.kai.color);
    this.spot('aoi', 'npc', -12.8, 12.6, 2.2, null, null, '和小葵說話', NPCS.aoi.color);
  }

  /** 互動點：發光圈 + 浮動標籤 */
  spot(id, kind, x, z, r, title, sub, prompt, color, labelY = 3.6, npc = null) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r * 0.86, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'npc' ? 0 : 0.75, depthWrite: false }));
    ring.position.set(x, 0.04, z);
    this.scene.add(ring);
    let label = null;
    if (title) { label = makeLabel(title, sub, color, 1.15); label.position.set(x, labelY, z); this.scene.add(label); }
    this.spots.push({ id, kind, x, z, r, prompt, ring, label, npc });
  }

  // ---------------- 每畫格 ----------------
  /** move: {x, y} 搖桿（-1..1，y 向前為正）；look: 鏡頭水平旋轉量 */
  update(dt, move, look) {
    this.time += dt;
    const t = this.time;
    this.camYaw += look;
    // 鏡頭相對移動
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rgtX = Math.cos(this.camYaw), rgtZ = -Math.sin(this.camYaw);
    let mx = fwdX * move.y + rgtX * move.x, mz = fwdZ * move.y + rgtZ * move.x;
    const mag = Math.min(1, Math.hypot(mx, mz));
    const speedMax = 5.2;
    const targetV = mag > 0.08 ? speedMax * mag : 0;
    this.pv += (targetV - this.pv) * Math.min(1, dt * 10);
    if (mag > 0.08) {
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      const want = Math.atan2(mx, mz);
      let d = want - this.ph; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ph += d * Math.min(1, dt * 12);
    }
    let nx = this.px + Math.sin(this.ph) * this.pv * dt, nz = this.pz + Math.cos(this.ph) * this.pv * dt;
    [nx, nz] = this.resolve(nx, nz);
    this.px = nx; this.pz = nz;
    this.hero.root.position.set(this.px, 0, this.pz);
    this.hero.root.rotation.y = this.ph;
    this.hero.update(dt, this.pv);

    // NPC：待機、主角靠近時轉頭面向主角
    for (const n of this.npcs) {
      const dx = this.px - n.x, dz = this.pz - n.z, d = Math.hypot(dx, dz);
      const want = d < 6 ? Math.atan2(dx, dz) : n.h0;
      let a = want - n.c.root.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
      n.c.root.rotation.y += a * Math.min(1, dt * 3);
      if (d < 6 && !n.greeted) { n.greeted = true; n.c.wave(); }
      if (d > 9) n.greeted = false;
      n.c.update(dt, 0);
    }
    // 最近的互動點
    let best = null, bd = Infinity;
    for (const s of this.spots) {
      const d = Math.hypot(this.px - s.x, this.pz - s.z);
      if (d < s.r + 0.4 && d < bd) { bd = d; best = s; }
      if (s.kind !== 'npc') s.ring.material.opacity = 0.45 + Math.sin(t * 3) * 0.25 + (s === this.near ? 0.3 : 0);
      if (s.label) s.label.position.y += Math.sin(t * 2 + s.x) * 0.002;
    }
    this.near = best;
    // 旗幟飄動、金幣轉動
    for (const f of this.flags) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];
        p.array[i * 3 + 2] = Math.sin(t * 4 + x * 2.2 + f.userData.seed) * 0.12 * x;
      }
      p.needsUpdate = true;
    }
    for (const c of this.coins || []) c.rotation.x = t * 2;

    // 第三人稱鏡頭
    const dist = 7.2, pitch = 0.42;
    const tx = this.px, ty = 1.3, tz = this.pz;
    const cx = tx + Math.sin(this.camYaw) * dist * Math.cos(pitch);
    const cy = ty + dist * Math.sin(pitch);
    let cz = tz + Math.cos(this.camYaw) * dist * Math.cos(pitch);
    if (cz < -21.2 && Math.abs(cx + 19.5) > 4.6) cz = -21.2; // 不要穿進車庫建築
    const want = new THREE.Vector3(cx, cy, cz);
    // 鏡頭碰撞：從主角往鏡頭方向打射線，撞到建築就拉近
    const from = new THREE.Vector3(tx, ty, tz), dir = want.clone().sub(from), len = dir.length();
    dir.normalize();
    this.ray ||= new THREE.Raycaster();
    this.ray.set(from, dir); this.ray.far = len;
    const hit = this.ray.intersectObjects(this.camBlockers || [], false)[0];
    if (hit) want.copy(from).addScaledVector(dir, Math.max(1.2, hit.distance - 0.4));
    if (this.snap || hit) { this.camPos.lerp(want, this.snap ? 1 : 1 - Math.exp(-dt * 20)); this.snap = false; } else this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
    const cam = this.camera;
    cam.fov = 55; cam.near = 0.1; cam.far = 1500;
    cam.updateProjectionMatrix();
    cam.position.copy(this.camPos);
    cam.lookAt(tx, ty, tz);
    this.sun.target.position.set(this.px, 0, this.pz);
    this.sun.position.set(this.px + this.sunOffset.x, this.sunOffset.y, this.pz + this.sunOffset.z);
    this.renderer.render(this.scene, cam);
  }

  /** 與方塊 / 圓碰撞並限制在園區內 */
  resolve(x, z) {
    const R = 0.35;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (c.r !== undefined) {
          const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = c.r + R;
          if (d < min && d > 1e-4) { x = c.x + dx / d * min; z = c.z + dz / d * min; }
        } else {
          const dx = x - c.x, dz = z - c.z, ox = c.hx + R - Math.abs(dx), oz = c.hz + R - Math.abs(dz);
          if (ox > 0 && oz > 0) { if (ox < oz) x += Math.sign(dx) * ox; else z += Math.sign(dz) * oz; }
        }
      }
    }
    x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x));
    z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z));
    return [x, z];
  }

  /** 互動結束後把主角往後退一步，避免立刻又觸發 */
  stepBack() {
    if (!this.near) return;
    const dx = this.px - this.near.x, dz = this.pz - this.near.z, d = Math.hypot(dx, dz) || 1;
    this.ph = Math.atan2(dx, dz);
  }

  dispose() {
    for (const m of this.carModels) m.dispose();
    this.env.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { if (m.map) m.map.dispose(); if (m.dispose) m.dispose(); }
    });
  }
}
