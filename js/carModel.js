// 依車款規格以程序化網格建立寫實跑車：平滑放樣車身（葉子板隆起、輪拱）、玻璃座艙、燈組、進氣口、
// 擴散器、排氣管、尾翼與含輻條 / 碟盤 / 卡鉗的輪圈。原點在地面、車頭朝 +Z。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const REST_DROP = 0.4;
const BODY_RINGS = 120, BODY_VERTS = 48;
const CABIN_RINGS = 64, CABIN_VERTS = 40;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
const gauss = (d, s) => Math.exp(-d * d / (2 * s * s));
const col = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

// 單調 Hermite 插值（避免過衝）
export function smooth(xs, ys, x) {
  const n = xs.length;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
  const m0 = slope(xs, ys, i) * h, m1 = slope(xs, ys, i + 1) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1;
}
function slope(xs, ys, i) {
  const n = xs.length;
  if (i === 0) return (ys[1] - ys[0]) / (xs[1] - xs[0]);
  if (i === n - 1) return (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
  const d0 = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]), d1 = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  return d0 * d1 <= 0 ? 0 : (d0 + d1) * 0.5;
}

/** 把封閉截面環連成網格；classify(中心, 法線) 回傳材質編號，回傳每個編號一個 geometry。 */
export function loft(rings, capStart, capEnd, classes = 1, classify = null) {
  const m = rings[0].length;
  const pos = [];
  for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
  const tris = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < m; j++) {
      const a = k * m + j, b = k * m + (j + 1) % m, c = (k + 1) * m + j, d = (k + 1) * m + (j + 1) % m;
      tris.push(a, c, b, b, c, d);
    }
  }
  const cap = (ring, end) => {
    const start = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { pos.push(p[0], p[1], p[2]); cx += p[0]; cy += p[1]; cz += p[2]; }
    pos.push(cx / m, cy / m, cz / m);
    const ci = start + m;
    for (let j = 0; j < m; j++) {
      const a = start + j, b = start + (j + 1) % m;
      if (end) tris.push(a, b, ci); else tris.push(a, ci, b);
    }
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings[rings.length - 1], true);

  // 方向修正：法線整體應背離中心
  const n = pos.length / 3;
  let gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < n; i++) { gx += pos[i * 3]; gy += pos[i * 3 + 1]; gz += pos[i * 3 + 2]; }
  gx /= n; gy /= n; gz /= n;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), M = new THREE.Vector3();
  const tri = (i) => {
    A.fromArray(pos, tris[i] * 3); B.fromArray(pos, tris[i + 1] * 3); C.fromArray(pos, tris[i + 2] * 3);
    N.subVectors(B, A).cross(M.subVectors(C, A));
    M.copy(A).add(B).add(C).multiplyScalar(1 / 3);
  };
  let score = 0;
  for (let i = 0; i < tris.length; i += 3) {
    tri(i);
    score += N.x * (M.x - gx) + N.y * (M.y - gy) + N.z * (M.z - gz);
  }
  if (score < 0) for (let i = 0; i < tris.length; i += 3) { const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t; }

  const lists = Array.from({ length: classes }, () => []);
  for (let i = 0; i < tris.length; i += 3) {
    let c = 0;
    if (classes > 1 && classify) {
      tri(i);
      if (N.lengthSq() < 1e-14) N.set(0, 1, 0); else N.normalize();
      c = Math.max(0, Math.min(classes - 1, classify(M, N)));
    }
    lists[c].push(tris[i], tris[i + 1], tris[i + 2]);
  }
  const posAttr = new Float32Array(pos);
  return lists.map((idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posAttr.slice(), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** 繞 X 軸旋轉體，profile 為 [軸向位置, 半徑] */
export function lathe(profile, segments) {
  const rings = profile.map(([ax, r]) => {
    const ring = [];
    for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      ring.push([ax, Math.cos(a) * r, Math.sin(a) * r]);
    }
    return ring;
  });
  return loft(rings, false, false)[0];
}

// 以「群組 + 材質」收集零件，最後合併成少量網格（手機效能較好）
class Collector {
  constructor() { this.items = new Map(); }
  add(group, geo, mat, matrix) {
    const g = geo.index ? geo.clone() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const key = group.uuid + '|' + mat.uuid;
    if (!this.items.has(key)) this.items.set(key, { group, mat, geos: [] });
    this.items.get(key).geos.push(g);
  }
  build(castShadow = true) {
    for (const { group, mat, geos } of this.items.values()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }));
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = false;
      group.add(mesh);
    }
  }
}

const UNIT = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 2, 24),
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const D2R = Math.PI / 180;
function trs(pos, scale, rot) {
  if (rot instanceof THREE.Quaternion) _q.copy(rot);
  else if (rot) _q.setFromEuler(_e.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'YXZ'));
  else _q.identity();
  return _m.compose(_p.set(...pos), _q, _s.set(...scale)).clone();
}

export const groundOffset = (s) => REST_DROP + s.wheelRadius;
export const trackHalf = (s, front) => {
  const z = front ? s.frontAxleZ : s.rearAxleZ;
  const w = front ? s.frontTireWidth : s.rearTireWidth;
  return smooth(s.bodyZ, s.bodyHalfWidth, z) - w * 0.5 - 0.035;
};

// ---------------- 車身 ----------------
const bulgeAt = (s, z) => gauss(z - s.frontAxleZ, 0.5) * s.fenderBulgeFront + gauss(z - s.rearAxleZ, 0.55) * s.fenderBulgeRear;
function archY(s, z) {
  let best = -1;
  const ra = s.wheelRadius + 0.05;
  for (const az of [s.frontAxleZ, s.rearAxleZ]) {
    const dz = z - az;
    if (Math.abs(dz) < ra) best = Math.max(best, s.wheelRadius + Math.sqrt(ra * ra - dz * dz));
  }
  return best;
}
function bodyRing(s, z, m) {
  const hw = smooth(s.bodyZ, s.bodyHalfWidth, z);
  const yb = smooth(s.bodyZ, s.bodyBottom, z), yt = smooth(s.bodyZ, s.bodyTop, z);
  const yc = (yb + yt) / 2, h = (yt - yb) / 2, e = 2 / s.bodyRoundness;
  const bulge = bulgeAt(s, z), arch = archY(s, z);
  const ring = [];
  for (let j = 0; j < m; j++) {
    const t = -Math.PI / 2 + j / m * Math.PI * 2;
    let x = hw * spow(Math.cos(t), e);
    let y = yc + h * spow(Math.sin(t), e);
    const k = clamp01((y - yb) / (yt - yb));
    x *= lerp(1, s.bodyTaper, k * k);
    const xr = Math.abs(x) / hw;
    if (y > yc) y += bulge * sstep(0.35, 0.8, xr) * clamp01((y - yc) / h * 1.5);
    if (arch > 0 && xr > 0.55 && y < arch) y = arch;
    ring.push([x, y, z]);
  }
  return ring;
}
function buildBody(s) {
  const rings = [];
  for (let i = 0; i < BODY_RINGS; i++) rings.push(bodyRing(s, lerp(s.rearZ, s.frontZ, i / (BODY_RINGS - 1)), BODY_VERTS));
  return loft(rings, true, true, 2, (c, n) => {
    if (n.y < -0.35) return 1;
    if (Math.abs(n.x) > 0.3 && Math.sign(n.x) !== Math.sign(c.x) && n.y < 0.2) return 1;
    return 0;
  });
}
const bodyTopC = (s, z) => smooth(s.bodyZ, s.bodyTop, z);
function buildCabin(s) {
  const z0 = s.cabinZ[0], z1 = s.cabinZ[s.cabinZ.length - 1];
  const e = 2 / s.cabinRoundness;
  const rings = [];
  for (let i = 0; i < CABIN_RINGS; i++) {
    const z = lerp(z0, z1, i / (CABIN_RINGS - 1));
    const hw = smooth(s.cabinZ, s.cabinHalfWidth, z);
    const baseY = bodyTopC(s, z) - 0.12;
    const top = Math.max(smooth(s.cabinZ, s.cabinTop, z), baseY + 0.03);
    const yc = (baseY + top) / 2, h = (top - baseY) / 2;
    const ring = [];
    for (let j = 0; j < CABIN_VERTS; j++) {
      const t = -Math.PI / 2 + j / CABIN_VERTS * Math.PI * 2;
      let x = hw * spow(Math.cos(t), e);
      const y = yc + h * spow(Math.sin(t), e);
      const k = clamp01((y - baseY) / (top - baseY));
      x *= lerp(1, s.cabinTaper, Math.pow(k, 1.2));
      ring.push([x, y, z]);
    }
    rings.push(ring);
  }
  return loft(rings, true, true, 2, (c, n) => {
    const baseY = bodyTopC(s, c.z) - 0.12;
    if (c.y < baseY + 0.14) return 0;
    const ax = Math.abs(n.x);
    if (c.z > s.windshieldTopZ) {
      if (ax < 0.5 && n.y > -0.2) return 1;
      if (ax > 0.72 && c.z < z1 - 0.15) return 1;
      return 0;
    }
    if (c.z > s.sideGlassRearZ && ax > 0.6 && n.y < 0.6) return 1;
    if (c.z < s.rearGlassZ && n.y > 0.25 && ax < 0.5) return 1;
    return 0;
  });
}
function topY(s, z, xAbs) {
  const ring = bodyRing(s, z, 96);
  const yc = (smooth(s.bodyZ, s.bodyBottom, z) + smooth(s.bodyZ, s.bodyTop, z)) / 2;
  let best = smooth(s.bodyZ, s.bodyTop, z), bd = 1e9;
  for (const p of ring) {
    if (p[1] < yc || p[0] < 0) continue;
    const d = Math.abs(p[0] - xAbs);
    if (d < bd) { bd = d; best = p[1]; }
  }
  return best;
}
function sideX(s, z, y) {
  const ring = bodyRing(s, z, 96);
  let best = 0, bd = 1e9;
  for (const p of ring) {
    if (p[0] < 0) continue;
    const d = Math.abs(p[1] - y);
    if (d < bd) { bd = d; best = p[0]; }
  }
  return best;
}

// ---------------- 材質 ----------------
function materials(s, paint) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: col(paint), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04 }),
    trim: new THREE.MeshStandardMaterial({ color: col([0.025, 0.025, 0.028]), roughness: 0.6, metalness: 0.1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: col([0.012, 0.016, 0.022]), roughness: 0.03, metalness: 0.3, clearcoat: 1 }),
    chrome: new THREE.MeshStandardMaterial({ color: col([0.85, 0.85, 0.87]), roughness: 0.1, metalness: 1 }),
    carbon: new THREE.MeshStandardMaterial({ color: col([0.035, 0.035, 0.04]), roughness: 0.25, metalness: 0.35 }),
    head: new THREE.MeshStandardMaterial({ color: col([0.95, 0.97, 1]), emissive: new THREE.Color(2.5, 2.6, 3), roughness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ color: col([0.5, 0.02, 0.02]), emissive: new THREE.Color(0.9, 0.02, 0.02), roughness: 0.2 }),
    tire: new THREE.MeshStandardMaterial({ color: col([0.035, 0.035, 0.037]), roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ color: col(s.rimColor), roughness: 0.25, metalness: 0.95 }),
    disc: new THREE.MeshStandardMaterial({ color: col([0.42, 0.42, 0.43]), roughness: 0.45, metalness: 0.9 }),
    caliper: new THREE.MeshStandardMaterial({ color: col(s.caliperColor), roughness: 0.4, metalness: 0.2 }),
  };
}

// ---------------- 組裝 ----------------
export function buildCar(s, paint, { shadows = true } = {}) {
  const M = materials(s, paint);
  const root = new THREE.Group();
  root.name = 'Car_' + s.id;
  const body = new THREE.Group(); // 車身（可做側傾 / 俯仰），車輪在外
  root.add(body);
  const col_ = new Collector();

  const [bPaint, bTrim] = buildBody(s);
  const [cPaint, cGlass] = buildCabin(s);
  col_.add(body, bPaint, M.paint); col_.add(body, bTrim, M.trim);
  col_.add(body, cPaint, M.paint); col_.add(body, cGlass, M.glass);

  const P = (type, pos, scale, mat, rot, group = body) => col_.add(group, UNIT[type], mat, trs(pos, scale, rot));
  const fz = s.frontZ, rz = s.rearZ;

  // 頭燈
  for (const side of [-1, 1]) {
    if (s.headLights === 'slim') {
      const z = fz - 0.34;
      const x = smooth(s.bodyZ, s.bodyHalfWidth, z) * 0.62;
      const y = topY(s, z, x);
      const sl = (topY(s, z + 0.1, x) - topY(s, z - 0.1, x)) / 0.2;
      const rot = [-Math.atan(sl) / D2R, side * 14, 0];
      P('sphere', [side * x, y - 0.022, z], [0.40, 0.05, 0.26], M.trim, rot);
      P('sphere', [side * x, y + 0.002, z], [0.34, 0.05, 0.21], M.head, rot);
    } else {
      const z = fz - 0.3;
      const x = smooth(s.bodyZ, s.bodyHalfWidth, z) * 0.66;
      const y = topY(s, z, x);
      P('sphere', [side * x, y - 0.05, z + 0.02], [0.24, 0.16, 0.26], M.trim);
      P('sphere', [side * x, y - 0.045, z + 0.03], [0.2, 0.13, 0.22], M.head);
    }
  }
  // 前保桿進氣 / 下擾流
  {
    const z = fz - 0.08;
    const hw = smooth(s.bodyZ, s.bodyHalfWidth, z), yb = smooth(s.bodyZ, s.bodyBottom, z);
    P('sphere', [0, yb + 0.1, z], [hw * 1.1, 0.13, 0.16], M.trim);
    P('sphere', [-hw * 0.62, yb + 0.12, fz - 0.22], [0.42, 0.12, 0.22], M.trim);
    P('sphere', [hw * 0.62, yb + 0.12, fz - 0.22], [0.42, 0.12, 0.22], M.trim);
    const sz = fz - 0.25;
    P('cube', [0, smooth(s.bodyZ, s.bodyBottom, sz) - 0.005, sz], [smooth(s.bodyZ, s.bodyHalfWidth, sz) * 1.85, 0.025, 0.34], M.carbon);
  }
  // 側進氣口
  if (s.sideIntake) {
    const z = s.sideIntakeZ;
    const y = lerp(smooth(s.bodyZ, s.bodyBottom, z), smooth(s.bodyZ, s.bodyTop, z), 0.5);
    const x = sideX(s, z, y);
    for (const side of [-1, 1]) P('sphere', [side * (x - 0.015), y, z], [0.07, 0.24, 0.62], M.trim, [0, side * 6, side * -4]);
  }
  // 側裙
  {
    const zm = (s.frontAxleZ + s.rearAxleZ) / 2;
    const yb = smooth(s.bodyZ, s.bodyBottom, zm);
    const x = sideX(s, zm, yb + 0.06);
    const len = (s.frontAxleZ - s.rearAxleZ) - s.wheelRadius * 2.3;
    for (const side of [-1, 1]) P('cube', [side * (x - 0.02), yb + 0.03, zm], [0.06, 0.06, len], M.carbon);
  }
  // 後照鏡
  {
    const z = s.cabinZ[s.cabinZ.length - 1] - 0.2;
    const cw = smooth(s.cabinZ, s.cabinHalfWidth, z);
    const y = bodyTopC(s, z) + 0.08;
    for (const side of [-1, 1]) {
      P('cube', [side * (cw + 0.04), y - 0.03, z + 0.02], [0.12, 0.025, 0.05], M.trim);
      P('sphere', [side * (cw + 0.13), y, z], [0.09, 0.08, 0.17], M.paint, [0, side * 8, 0]);
    }
  }
  // 尾燈、擴散器、排氣
  {
    const yb = smooth(s.bodyZ, s.bodyBottom, rz), yt = smooth(s.bodyZ, s.bodyTop, rz);
    const hw = smooth(s.bodyZ, s.bodyHalfWidth, rz);
    const y = yt - 0.11;
    const axisZ = [90, 0, 0];
    for (const side of [-1, 1]) {
      if (s.tailLights === 'roundDouble') {
        for (const fx of [0.36, 0.62]) {
          P('cyl', [side * hw * fx, y, rz - 0.005], [0.18, 0.02, 0.18], M.trim, axisZ);
          P('cyl', [side * hw * fx, y, rz - 0.02], [0.145, 0.02, 0.145], M.tail, axisZ);
        }
      } else if (s.tailLights === 'roundSingle') {
        P('cyl', [side * hw * 0.5, y, rz - 0.005], [0.2, 0.02, 0.2], M.chrome, axisZ);
        P('cyl', [side * hw * 0.5, y, rz - 0.02], [0.16, 0.02, 0.16], M.tail, axisZ);
      } else {
        P('sphere', [side * hw * 0.42, y, rz + 0.01], [hw * 0.62, 0.06, 0.06], M.tail);
      }
    }
    if (s.tailLights === 'bar') P('cube', [0, y, rz + 0.005], [hw * 0.5, 0.012, 0.02], M.tail);
    const dz = rz + 0.18;
    const dyb = smooth(s.bodyZ, s.bodyBottom, dz);
    const dw = smooth(s.bodyZ, s.bodyHalfWidth, dz) * 1.45;
    P('cube', [0, dyb + 0.05, dz], [dw, 0.14, 0.38], M.carbon);
    for (let f = -2; f <= 2; f++) P('cube', [f * dw * 0.18, dyb + 0.03, dz - 0.04], [0.018, 0.16, 0.4], M.carbon);
    const ey = yb + 0.08;
    const xs = s.exhaustCount >= 4 ? [-0.42, -0.28, 0.28, 0.42] : [-0.3, 0.3];
    for (const ex of xs) {
      P('cyl', [ex * hw, ey, rz - 0.03], [0.1, 0.07, 0.1], M.chrome, axisZ);
      P('cyl', [ex * hw, ey, rz - 0.075], [0.075, 0.03, 0.075], M.trim, axisZ);
    }
  }
  // 尾翼
  if (s.wing) {
    const chord = 0.36, thick = 0.045, pts = 20, half = s.wingSpan / 2;
    const pitch = new THREE.Quaternion().setFromEuler(new THREE.Euler(-9 * D2R, 0, 0));
    const rings = [];
    const v = new THREE.Vector3();
    for (let r = 0; r <= 6; r++) {
      const x = lerp(-half, half, r / 6);
      const ring = [];
      for (let j = 0; j < pts; j++) {
        const a = j / pts * Math.PI * 2;
        const zz = chord / 2 * Math.cos(a);
        const yy = thick / 2 * Math.sin(a) * (Math.sin(a) > 0 ? 1 : 0.45) * (0.6 + 0.4 * (0.5 + 0.5 * Math.cos(a)));
        v.set(x, yy, zz).applyQuaternion(pitch);
        ring.push([v.x, v.y + s.wingY, v.z + s.wingZ]);
      }
      rings.push(ring);
    }
    col_.add(body, loft(rings, true, true)[0], M.carbon);
    for (const side of [-1, 1]) {
      P('cube', [side * (half + 0.008), s.wingY - 0.03, s.wingZ], [0.016, 0.2, 0.46], M.carbon);
      const deckY = topY(s, s.wingZ + 0.05, 0.4);
      const hgt = s.wingY - deckY;
      P('cube', [side * 0.42, deckY + hgt / 2 - 0.02, s.wingZ + 0.05], [0.025, hgt, 0.16], M.trim);
    }
  }

  // 車輪
  const pivots = [], spinners = [], anchors = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const side = i % 2 === 0 ? -1 : 1;
    const R = s.wheelRadius, w = front ? s.frontTireWidth : s.rearTireWidth, hw = w / 2;
    const anchor = new THREE.Vector3(side * trackHalf(s, front), 0, front ? s.frontAxleZ : s.rearAxleZ);
    anchors.push(anchor);
    const pivot = new THREE.Group();
    pivot.position.set(anchor.x, R, anchor.z);
    const spinner = new THREE.Group();
    pivot.add(spinner);
    root.add(pivot);
    pivots.push(pivot); spinners.push(spinner);

    col_.add(spinner, lathe([
      [-hw + 0.012, 0.70 * R], [-hw, 0.78 * R], [-hw - 0.004, 0.88 * R], [-hw + 0.006, 0.955 * R], [-hw + 0.03, 0.993 * R], [-hw + 0.06, R],
      [hw - 0.06, R], [hw - 0.03, 0.993 * R], [hw - 0.006, 0.955 * R], [hw + 0.004, 0.88 * R], [hw, 0.78 * R], [hw - 0.012, 0.70 * R],
    ], 36), M.tire);
    const fx = side * (hw - 0.03);
    col_.add(spinner, lathe([[-hw + 0.02, 0.66 * R], [hw - 0.02, 0.66 * R], [hw - 0.02, 0.71 * R], [-hw + 0.02, 0.71 * R], [-hw + 0.02, 0.66 * R]], 28), M.rim);
    col_.add(spinner, lathe([[fx - side * 0.015, 0.6 * R], [fx + side * 0.005, 0.62 * R], [fx + side * 0.005, 0.72 * R], [fx - side * 0.015, 0.73 * R], [fx - side * 0.015, 0.6 * R]], 36), M.rim);

    let count, width;
    if (s.rims === 'tenSpoke') { count = 10; width = 0.045; } else if (s.rims === 'wire') { count = 28; width = 0.008; } else { count = 10; width = 0.05; }
    for (let k = 0; k < count; k++) {
      const a = s.rims === 'fiveSpoke' ? Math.floor(k / 2) * 72 + (k % 2 === 0 ? -7 : 7) : k * 360 / count;
      const rad = a * D2R, rMid = 0.37 * R;
      const tiltA = s.rims === 'wire' ? (k % 2 === 0 ? 12 : -12) : 0;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rad)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 6 * D2R)))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltA * D2R, 0, 0)));
      // 注意：Three.js 繞 X 軸正向旋轉把 +Y 轉向 +Z，與 (cos, sin) 擺放一致
      P('cube', [fx - side * 0.012, Math.cos(rad) * rMid, Math.sin(rad) * rMid], [0.028, 0.5 * R, width], M.rim, q, spinner);
    }
    const axisX = [0, 0, 90];
    P('cyl', [fx - side * 0.01, 0, 0], [0.26 * R, 0.03, 0.26 * R], M.rim, axisX, spinner);
    P('cyl', [fx + side * 0.004, 0, 0], [0.12 * R, 0.01, 0.12 * R], M.disc, axisX, spinner);
    P('cyl', [-side * 0.02, 0, 0], [1.18 * R, 0.014, 1.18 * R], M.disc, axisX, spinner);
    P('cube', [side * 0.005, 0.38 * R, (front ? -1 : 1) * 0.26 * R], [0.07, 0.24 * R, 0.42 * R], M.caliper, [(front ? 1 : -1) * 35, 0, 0], pivot);
  }

  col_.build(shadows);

  return {
    root, body, pivots, spinners, anchors,
    brake: M.tail, paint: M.paint,
    setPaint(c) { M.paint.color.copy(col(c)); },
    setBrake(on) { M.tail.emissive.setRGB(on ? 6 : 0.9, on ? 0.12 : 0.02, on ? 0.1 : 0.02); },
    dispose() {
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      Object.values(M).forEach((m) => m.dispose());
    },
  };
}
