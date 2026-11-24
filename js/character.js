// 程序化人物（主角與 NPC）：膠囊體四肢 + 簡單走路 / 待機 / 揮手動畫
import * as THREE from 'three';

const mats = new Map();
function mat(color, rough = 0.7, metal = 0) {
  const k = color + ':' + rough + ':' + metal;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return mats.get(k);
}
function cap(r, len, m) {
  const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
  g.castShadow = true;
  return g;
}

/**
 * look: { suit, suit2, skin, hair, hairStyle: 'short'|'long'|'pony'|'spiky', shoes, height }
 */
export function makeCharacter(look = {}) {
  const L = { suit: 0xd8262b, suit2: 0xf2f2f2, skin: 0xf1c7a3, hair: 0x2a1d16, hairStyle: 'short', shoes: 0x222222, height: 1, ...look };
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(L.height);
  root.add(body);
  const suit = mat(L.suit, 0.55), suit2 = mat(L.suit2, 0.55), skin = mat(L.skin, 0.8), hair = mat(L.hair, 0.9), shoe = mat(L.shoes, 0.5);

  // 腿（以髖關節為樞紐）
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, 0.92, 0);
    const thigh = cap(0.085, 0.36, suit); thigh.position.y = -0.24; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
    const shin = cap(0.075, 0.34, suit); shin.position.y = -0.2; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), shoe);
    foot.position.set(0, -0.42, 0.05); foot.castShadow = true; knee.add(foot);
    body.add(hip);
    legs.push({ hip, knee });
  }
  // 軀幹
  const torso = new THREE.Group(); torso.position.y = 0.95; body.add(torso);
  const pelvis = cap(0.15, 0.08, suit); pelvis.rotation.z = Math.PI / 2; pelvis.position.y = 0.02; torso.add(pelvis);
  const chest = cap(0.19, 0.34, suit); chest.position.y = 0.36; chest.scale.set(1.05, 1, 0.78); torso.add(chest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.04), suit2);
  stripe.position.set(0.06, 0.38, 0.145); torso.add(stripe);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.06, 16), mat(0x1a1a1a, 0.5));
  belt.position.y = 0.12; belt.scale.z = 0.8; torso.add(belt);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 12), suit2);
  collar.position.y = 0.66; torso.add(collar);
  // 手臂（以肩膀為樞紐）
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.25, 0.6, 0); torso.add(sh);
    const up = cap(0.065, 0.24, suit); up.position.y = -0.17; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.33; sh.add(el);
    const lo = cap(0.058, 0.22, suit); lo.position.y = -0.15; el.add(lo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0x1c1c1c, 0.6)); // 賽車手套
    hand.position.y = -0.31; el.add(hand);
    sh.rotation.z = s * 0.08;
    arms.push({ sh, el });
  }
  // 頭
  const neck = new THREE.Group(); neck.position.y = 0.72; torso.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skin);
  head.scale.set(0.95, 1.08, 1); head.position.y = 0.13; head.castShadow = true; neck.add(head);
  const eyeM = mat(0x111111, 0.3);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), eyeM);
    e.position.set(s * 0.045, 0.15, 0.118); neck.add(e);
  }
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 0.15; hairCap.rotation.x = -0.25; hairCap.castShadow = true; neck.add(hairCap);
  if (L.hairStyle === 'long') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.08), hair);
    back.position.set(0, 0.04, -0.1); neck.add(back);
  } else if (L.hairStyle === 'pony') {
    const tail = cap(0.045, 0.22, hair); tail.position.set(0, 0.06, -0.17); tail.rotation.x = 0.35; neck.add(tail);
  } else if (L.hairStyle === 'spiky') {
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), hair);
      const a = (i / 6) * Math.PI * 2;
      c.position.set(Math.sin(a) * 0.07, 0.27, Math.cos(a) * 0.05 - 0.02);
      c.rotation.set(Math.cos(a) * 0.5 - 0.2, 0, -Math.sin(a) * 0.5);
      neck.add(c);
    }
  }
  if (L.cap) { // 鴨舌帽
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(L.cap, 0.6));
    crown.position.y = 0.17; neck.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), mat(L.cap, 0.6));
    brim.position.set(0, 0.19, 0.09); neck.add(brim);
  }
  // 腳下陰影圓（低畫質沒有陰影時也有落地感）
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  blob.position.y = 0.02; root.add(blob);

  let phase = Math.random() * 6, t = Math.random() * 6, wave = 0;
  return {
    root,
    /** speed: m/s；gesture: 'wave' 揮手一次 */
    update(dt, speed = 0) {
      t += dt;
      const k = Math.min(1, speed / 3.2);
      phase += dt * (2.2 + speed * 2.1);
      const sw = Math.sin(phase);
      legs[0].hip.rotation.x = sw * 0.65 * k;
      legs[1].hip.rotation.x = -sw * 0.65 * k;
      legs[0].knee.rotation.x = Math.max(0, -Math.sin(phase - 0.9)) * 0.9 * k;
      legs[1].knee.rotation.x = Math.max(0, Math.sin(phase - 0.9)) * 0.9 * k;
      arms[0].sh.rotation.x = -sw * 0.55 * k;
      arms[1].sh.rotation.x = sw * 0.55 * k;
      arms[0].el.rotation.x = arms[1].el.rotation.x = -0.25 - 0.35 * k;
      body.position.y = Math.abs(Math.cos(phase)) * 0.045 * k + Math.sin(t * 2) * 0.006 * (1 - k);
      torso.rotation.y = sw * 0.08 * k;
      torso.rotation.x = 0.06 * k;
      if (wave > 0) {
        wave = Math.max(0, wave - dt);
        const w = Math.min(1, wave * 2, (1.6 - wave) * 3);
        arms[1].sh.rotation.z = 0.08 + 2.6 * w;
        arms[1].el.rotation.z = -0.4 * w + Math.sin(t * 12) * 0.35 * w;
      } else { arms[1].sh.rotation.z = 0.08; arms[1].el.rotation.z = 0; }
    },
    wave() { wave = 1.6; },
    neck,
  };
}

/** 頭上名牌 / 站點標籤（Canvas 文字 Sprite） */
export function makeLabel(title, sub = '', color = '#ffd24d', scale = 1) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,10,14,0.72)';
  const r = 28, w = 512, h = sub ? 150 : 96, y0 = (160 - h) / 2;
  g.beginPath(); g.roundRect(8, y0, w - 16, h, r); g.fill();
  g.strokeStyle = color; g.lineWidth = 4; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.font = 'bold 54px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  g.fillText(title, w / 2, sub ? 58 : 82);
  if (sub) { g.fillStyle = color; g.font = '36px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif'; g.fillText(sub, w / 2, 112); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(2.4 * scale, 0.75 * scale, 1);
  s.renderOrder = 10;
  return s;
}
