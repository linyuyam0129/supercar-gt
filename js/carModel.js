// 依車款規格以程序化網格建立寫實跑車：平滑放樣車身（葉子板隆起、輪拱）、玻璃座艙、燈組、進氣口、
// 擴散器、排氣管、尾翼與含輻條 / 碟盤 / 卡鉗的輪圈。原點在地面、車頭朝 +Z。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const REST_DROP = 0.4;
const BODY_RINGS = 140, BODY_VERTS = 64;
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
      if (end) tris.push(a, ci, b); else tris.push(a, b, ci); // 與側面同向，整體翻轉時才會一起翻
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
/** 葉子板隆起高度：至少要高過輪胎頂端，低矮車身才不會讓輪拱吃掉葉子板 */
function fenderBulge(s, front) {
  const key = front ? '_bf' : '_br';
  if (s[key] === undefined) {
    const az = front ? s.frontAxleZ : s.rearAxleZ;
    const need = 2 * s.wheelRadius + 0.1 - smooth(s.bodyZ, s.bodyTop, az);
    s[key] = Math.max(front ? s.fenderBulgeFront : s.fenderBulgeRear, need);
  }
  return s[key];
}
const bulgeAt = (s, z) => gauss(z - s.frontAxleZ, 0.5) * fenderBulge(s, true) + gauss(z - s.rearAxleZ, 0.55) * fenderBulge(s, false);
/** 輪拱半徑：不能高過該處引擎蓋 / 葉子板，否則會在上方開洞 */
function archR(s, az) {
  const top = smooth(s.bodyZ, s.bodyTop, az) + fenderBulge(s, az > 0) * 0.5;
  return Math.max(s.wheelRadius + 0.02, Math.min(s.wheelRadius + 0.05, top - 0.05 - s.wheelRadius));
}
/** 輪拱：把落在輪拱圓內的車身側面頂點推到圓周上（上半圓）或兩側（下半），得到平滑的輪拱邊緣 */
function carveArch(s, p, xr, sinT) {
  if (xr <= 0.55 || sinT > 0.85) return p; // 只處理側面與底部
  const cy = s.wheelRadius;
  for (const az of [s.frontAxleZ, s.rearAxleZ]) {
    const ra = archR(s, az);
    const dz = p[2] - az, dy = p[1] - cy;
    if (dy >= 0) {
      const d = Math.hypot(dz, dy);
      if (d < ra) {
        if (d < 1e-5) return [p[0], cy + ra, az];
        return [p[0], cy + dy / d * ra, az + dz / d * ra];
      }
    } else if (Math.abs(dz) < ra) {
      return [p[0], p[1], az + (dz >= 0 ? ra : -ra)];
    }
  }
  return p;
}
/** 面中心是否位於輪拱內壁（用位置判斷，邊界才會平滑） */
function inArch(s, c) {
  const cy = s.wheelRadius;
  for (const az of [s.frontAxleZ, s.rearAxleZ]) {
    const ra = archR(s, az) + 0.006;
    const dz = c.z - az, dy = c.y - cy;
    if (dy >= 0 ? dz * dz + dy * dy <= ra * ra : Math.abs(dz) <= ra) return true;
  }
  return false;
}
/** 車身斷面上的一點。t 為斷面角度；腰線（最寬處）高度由 shoulder 決定，上半部可內收（tumblehome）、下半部微收 */
function sectionPt(s, z, t) {
  const hw = smooth(s.bodyZ, s.bodyHalfWidth, z);
  const yb = smooth(s.bodyZ, s.bodyBottom, z), yt = smooth(s.bodyZ, s.bodyTop, z);
  const ysh = yb + (yt - yb) * (s.shoulder ?? 0.5);
  const st = Math.sin(t), ct = Math.cos(t), up = st >= 0;
  const e = 2 / (up ? s.bodyRoundness : (s.bodyRoundnessLow ?? s.bodyRoundness));
  let x = hw * spow(ct, e);
  let y = up ? ysh + (yt - ysh) * spow(st, e) : ysh + (ysh - yb) * spow(st, e);
  if (up) { const ku = clamp01((y - ysh) / Math.max(1e-3, yt - ysh)); x *= lerp(1, s.bodyTaper, ku * ku); }
  else { const kl = clamp01((ysh - y) / Math.max(1e-3, ysh - yb)); x *= lerp(1, s.bodyTuck ?? 0.96, kl * kl); }
  const xr = Math.abs(x) / hw;
  if (up) y += bulgeAt(s, z) * sstep(0.4, 0.85, xr) * clamp01((y - ysh) / Math.max(1e-3, yt - ysh) * 1.5);
  return { x, y, xr, st, ysh };
}
function bodyRing(s, z, m) {
  const ring = [];
  for (let j = 0; j < m; j++) {
    const p = sectionPt(s, z, -Math.PI / 2 + j / m * Math.PI * 2);
    ring.push(carveArch(s, [p.x, p.y, z], p.xr, p.st));
  }
  return ring;
}
function bodyRingRaw(s, z, m) { // 不含輪拱，用來量測車身表面
  const ring = [];
  for (let j = 0; j < m; j++) { const p = sectionPt(s, z, -Math.PI / 2 + j / m * Math.PI * 2); ring.push([p.x, p.y, z]); }
  return ring;
}
function buildBody(s) {
  const rings = [];
  for (let i = 0; i < BODY_RINGS; i++) rings.push(bodyRing(s, lerp(s.rearZ, s.frontZ, i / (BODY_RINGS - 1)), BODY_VERTS));
  return loft(rings, true, true, 3, (c, n) => {
    if (archMembrane(s, c)) return 2;           // 被輪拱切開後橫跨開口的三角形：丟掉
    if (n.y < -0.35 && c.y < 0.45) return 1;   // 底盤
    if (n.y < 0.5 && inArch(s, c)) return 1;    // 輪拱內壁（朝上的葉子板頂面不算）
    return 0;
  });
}
/** 面中心明顯落在輪拱開口內（不在輪拱圓周上）→ 是跨越開口的薄膜 */
function archMembrane(s, c) {
  const cy = s.wheelRadius;
  for (const az of [s.frontAxleZ, s.rearAxleZ]) {
    const ra = archR(s, az) - 0.004;
    const dz = c.z - az, dy = c.y - cy;
    const hw = smooth(s.bodyZ, s.bodyHalfWidth, az);
    if (Math.abs(c.x) < hw * 0.5) continue;
    if (dy >= 0 ? dz * dz + dy * dy < ra * ra : Math.abs(dz) < ra) return true;
  }
  return false;
}
/** 輪拱內襯：上半圓弧 + 前後兩片直立擋板 */
function buildWells(s) {
  const out = [];
  for (const az of [s.frontAxleZ, s.rearAxleZ]) {
    const ra = archR(s, az) + 0.004, R = s.wheelRadius;
    const hw = smooth(s.bodyZ, s.bodyHalfWidth, az);
    const yb = smooth(s.bodyZ, s.bodyBottom, az);
    const front = az === s.frontAxleZ;
    const tw = front ? s.frontTireWidth : s.rearTireWidth;
    const x0 = Math.min(hw * 0.7, trackHalf(s, front) - tw / 2 - 0.02), x1 = hw - 0.004, w = x1 - x0;
    const capY = topY(s, az, x0) - 0.03; // 內襯不可高過該處車身表面
    for (const side of [-1, 1]) {
      const arc = new THREE.CylinderGeometry(ra, ra, w, 28, 1, true, 0, Math.PI);
      arc.rotateZ(Math.PI / 2);
      arc.translate(side * (x0 + w / 2), R, az);
      out.push(arc);
      for (const dz of [-ra, ra]) {
        const h = R - yb + 0.02;
        const g = new THREE.PlaneGeometry(w, h);
        g.translate(side * (x0 + w / 2), yb - 0.01 + h / 2, az + dz);
        out.push(g);
      }
      const bt = Math.min(R + ra, capY);
      const back = new THREE.PlaneGeometry(ra * 2, bt - yb);
      back.rotateY(Math.PI / 2);
      back.translate(side * x0, (bt + yb) / 2, az);
      out.push(back);
    }
  }
  return mergeGeometries(out.map((g) => g.toNonIndexed()));
}
const bodyTopC = (s, z) => smooth(s.bodyZ, s.bodyTop, z);
function cabinPoint(s, z, t) {
  const e = 2 / s.cabinRoundness;
  const hw = smooth(s.cabinZ, s.cabinHalfWidth, z);
  const baseY = bodyTopC(s, z) - 0.12;
  const top = Math.max(smooth(s.cabinZ, s.cabinTop, z), baseY + 0.03);
  const yc = (baseY + top) / 2, h = (top - baseY) / 2;
  let x = hw * spow(Math.cos(t), e);
  const y = yc + h * spow(Math.sin(t), e);
  const k = clamp01((y - baseY) / (top - baseY));
  x *= lerp(1, s.cabinTaper, Math.pow(k, 1.2));
  return [x, y, z, yc];
}
function buildCabin(s) {
  const z0 = s.cabinZ[0], z1 = s.cabinZ[s.cabinZ.length - 1];
  const rings = [];
  for (let i = 0; i < CABIN_RINGS; i++) {
    const z = lerp(z0, z1, i / (CABIN_RINGS - 1));
    const ring = [];
    for (let j = 0; j < CABIN_VERTS; j++) ring.push(cabinPoint(s, z, -Math.PI / 2 + j / CABIN_VERTS * Math.PI * 2).slice(0, 3));
    rings.push(ring);
  }
  return loft(rings, true, true)[0];
}
/** 車窗：在座艙表面上以 (z, 角度) 參數取一塊曲面並向外微移，邊界平滑；低於腰線的部分會被車身遮住 */
function glassPatch(s, zA, zB, tA, tB, nz = 28, nt = 18) {
  if (zB - zA < 0.05) return null;
  const pos = [], idx = [];
  const off = 0.008, eps = 1e-3;
  const P = (z, t) => cabinPoint(s, z, t);
  const rc = Math.min(0.1, (zB - zA) * 0.3);
  for (let i = 0; i <= nz; i++) {
    const z = lerp(zA, zB, i / nz);
    const u = Math.max(0, Math.min(z - zA, zB - z) / rc); // 浮點誤差可能讓 u 略小於 0 → sqrt 負數
    const shrink = u < 1 ? 0.14 * (1 - Math.sqrt(1 - (1 - u) * (1 - u))) : 0;
    const a = tA + shrink, b = Math.max(a, tB - shrink);
    for (let j = 0; j <= nt; j++) {
      const t = lerp(a, b, j / nt);
      const p = P(z, t);
      const dz = P(z + eps, t), dz2 = P(z - eps, t), dt = P(z, t + eps), dt2 = P(z, t - eps);
      const A = new THREE.Vector3(dz[0] - dz2[0], dz[1] - dz2[1], dz[2] - dz2[2]);
      const B = new THREE.Vector3(dt[0] - dt2[0], dt[1] - dt2[1], dt[2] - dt2[2]);
      const n = A.cross(B).normalize();
      if (n.x * p[0] + n.y * (p[1] - p[3]) < 0) n.negate();
      pos.push(p[0] + n.x * off, p[1] + n.y * off, p[2] + n.z * off);
    }
  }
  const w = nt + 1;
  for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 讓法線朝外
  const nrm = g.getAttribute('normal');
  const mid = Math.floor(pos.length / 6);
  const p = new THREE.Vector3().fromArray(pos, mid * 3);
  const yc = cabinPoint(s, p.z, Math.PI / 2)[3];
  if (nrm.getX(mid) * p.x + nrm.getY(mid) * (p.y - yc) < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  return g;
}
function buildGlass(s) {
  const z0 = s.cabinZ[0], z1 = s.cabinZ[s.cabinZ.length - 1];
  const out = [];
  const PI = Math.PI;
  out.push(glassPatch(s, s.windshieldTopZ, z1 - 0.02, 1.18, PI - 1.18));
  const zr = Math.max(z0 + 0.05, s.sideGlassRearZ), zf = z1 - 0.1;
  out.push(glassPatch(s, zr, zf, 0.04, 0.8));
  out.push(glassPatch(s, zr, zf, PI - 0.8, PI - 0.04));
  if (s.rearGlassZ > z0 + 0.1) out.push(glassPatch(s, z0 + 0.03, s.rearGlassZ, 1.05, PI - 1.05));
  return out.filter(Boolean);
}
function topY(s, z, xAbs) {
  const ring = bodyRingRaw(s, z, 96);
  const yb0 = smooth(s.bodyZ, s.bodyBottom, z), yc = yb0 + (smooth(s.bodyZ, s.bodyTop, z) - yb0) * (s.shoulder ?? 0.5);
  let best = smooth(s.bodyZ, s.bodyTop, z), bd = 1e9;
  for (const p of ring) {
    if (p[1] < yc || p[0] < 0) continue;
    const d = Math.abs(p[0] - xAbs);
    if (d < bd) { bd = d; best = p[1]; }
  }
  return best;
}
function sideX(s, z, y) {
  const ring = bodyRingRaw(s, z, 96);
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
    well: new THREE.MeshStandardMaterial({ color: col([0.02, 0.02, 0.022]), roughness: 0.9, side: THREE.DoubleSide }),
    carbonRoof: new THREE.MeshPhysicalMaterial({ color: col([0.02, 0.02, 0.022]), roughness: 0.25, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 }),
    trimGloss: new THREE.MeshPhysicalMaterial({ color: col([0.01, 0.01, 0.012]), roughness: 0.15, metalness: 0.3, clearcoat: 1 }),
    amber: new THREE.MeshStandardMaterial({ color: col([0.9, 0.45, 0.05]), emissive: new THREE.Color(0.5, 0.2, 0), roughness: 0.2 }),
  };
}


// ---------------- 著色器貼花（燈組、進氣口、碳纖維件）----------------
// 每個貼花是投影在某個平面上的圓角矩形（可斜切），用物件座標計算，邊緣俐落不受網格影響。
// plane：0 側面 (z,y)、1 上方 (z,|x|)、2 前後 (|x|,y)；kind：0 碳纖維 1 亮黑 2 深色玻璃 3 頭燈 4 尾燈 5 強調色 6 格柵
const PLANES = { side: 0, top: 1, end: 2 };
const KINDS = { carbon: 0, black: 1, glass: 2, head: 3, tail: 4, accent: 5, vent: 6 };
function decalMaterial(base, s, decals) {
  const m = base.clone();
  if (!decals.length) decals = [{ plane: 'side', kind: 'black', u: [0, 0], v: [0, 0], range: [99, 99] }]; // 佔位（GLSL 陣列不可為空）
  const N = decals.length;
  const A = [], B = [], C = [];
  for (const d of decals) {
    const pl = PLANES[d.plane];
    const [u0, u1] = d.u, [v0, v1] = d.v;
    A.push(new THREE.Vector4((u0 + u1) / 2, (v0 + v1) / 2, Math.abs(u1 - u0) / 2, Math.abs(v1 - v0) / 2));
    B.push(new THREE.Vector4(d.skew || 0, Math.min(d.r ?? 0.02, Math.abs(u1 - u0) / 2, Math.abs(v1 - v0) / 2), d.range ? d.range[0] : -99, d.range ? d.range[1] : 99));
    C.push(new THREE.Vector4(pl, KINDS[d.kind], 0, 0));
  }
  const uni = {
    uDA: { value: A }, uDB: { value: B }, uDC: { value: C }, uBrake: { value: 0 },
    uAccent: { value: col(s.accent || [0.6, 0.6, 0.62]) },
    uLower: { value: col(s.twoTone || [0, 0, 0]) }, uCut: { value: s.twoTone ? s.twoToneY : -99 },
  };
  m.userData.uni = uni;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'varying vec3 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    const head = `#define DECALS ${Math.max(1, N)}
varying vec3 vLocal;
uniform vec4 uDA[DECALS]; uniform vec4 uDB[DECALS]; uniform vec4 uDC[DECALS];
uniform float uBrake; uniform vec3 uAccent; uniform vec3 uLower; uniform float uCut;
`;
    const body = `
float decalAmt = 0.0; float decalR = roughness; float decalM = metalness; vec3 decalE = vec3(0.0);
{
  // 雙色車身
  float tt = smoothstep(uCut - 0.003, uCut + 0.003, vLocal.y);
  diffuseColor.rgb = mix(uLower, diffuseColor.rgb, tt);
  if (uCut > -50.0) { float pin = 1.0 - smoothstep(0.004, 0.008, abs(vLocal.y - uCut - 0.012)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.52), pin * 0.6); }
  vec3 p = vec3(abs(vLocal.x), vLocal.y, vLocal.z);
  for (int i = 0; i < ${N}; i++) {
    vec4 a = uDA[i]; vec4 b = uDB[i]; vec4 c = uDC[i];
    vec2 q; float rng;
    if (c.x < 0.5) { q = p.zy; rng = p.x; } else if (c.x < 1.5) { q = p.zx; rng = p.y; } else { q = p.xy; rng = p.z; }
    q -= a.xy;
    q.y -= b.x * q.x;
    vec2 e = abs(q) - a.zw + b.y;
    float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - b.y;
    float aa = fwidth(sd) + 1e-4;
    float m = (1.0 - smoothstep(-aa, aa, sd)) * step(b.z, rng) * step(rng, b.w);
    if (m <= 0.0) continue;
    int k = int(c.y + 0.5);
    vec3 cc = vec3(0.0); float rr = 0.5; float mm = 0.0; vec3 ee = vec3(0.0);
    if (k == 0) { float tw = step(0.5, fract((vLocal.z + vLocal.y - vLocal.x) * 55.0)) * 0.5 + step(0.5, fract((vLocal.z - vLocal.y + vLocal.x) * 55.0)) * 0.5; cc = vec3(0.016, 0.016, 0.018) * (0.7 + 0.6 * tw); rr = 0.3; mm = 0.35; }
    else if (k == 1) { cc = vec3(0.005); rr = 0.12; mm = 0.3; }
    else if (k == 2) { cc = vec3(0.003, 0.004, 0.006); rr = 0.05; mm = 0.7; }
    else if (k == 3) { cc = vec3(0.9, 0.92, 1.0); rr = 0.1; ee = vec3(3.2, 3.3, 3.7); }
    else if (k == 4) { cc = vec3(0.45, 0.01, 0.01); rr = 0.15; ee = vec3(1.1, 0.03, 0.02) * (1.0 + uBrake * 4.5); }
    else if (k == 5) { cc = uAccent; rr = 0.3; mm = 0.5; }
    else { float sl = step(0.5, fract(q.x * 30.0)); cc = vec3(0.003) + vec3(0.025) * sl; rr = 0.55; mm = 0.2; }
    diffuseColor.rgb = mix(diffuseColor.rgb, cc, m);
    decalR = mix(decalR, rr, m); decalM = mix(decalM, mm, m); decalE = mix(decalE, ee, m);
    decalAmt = max(decalAmt, m);
  }
}
`;
    sh.fragmentShader = head + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>' + body)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, decalR, decalAmt);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, decalM, decalAmt);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += decalE;');
  };
  m.customProgramCacheKey = () => 'decal' + N;
  return m;
}

/** 依車身尺寸自動產生超跑貼花（各車可用 s.look 微調） */
function hyperDecals(s) {
  const L = s.look || {};
  const fz = s.frontZ, rz = s.rearZ;
  const hwAt = (z) => smooth(s.bodyZ, s.bodyHalfWidth, z);
  const yb = (z) => smooth(s.bodyZ, s.bodyBottom, z), yt = (z) => smooth(s.bodyZ, s.bodyTop, z);
  const d = [];
  // 碳纖維側裙
  d.push({ plane: 'side', kind: 'carbon', u: [rz + 0.15, fz - 0.15], v: [-1, yb(0) + (L.sill ?? 0.11)], r: 0.01, range: [0.5, 9] });
  // 前保桿：中央格柵與兩側大進氣口
  const nb = yb(fz - 0.05), nt = yt(fz - 0.05), nh = nt - nb, nw = hwAt(fz - 0.05);
  d.push({ plane: 'end', kind: 'carbon', u: [-nw, nw], v: [nb - 0.2, nb + 0.04], r: 0.01, range: [fz - 0.45, 99] }); // 下擾流
  if (L.grille === 'horseshoe') {
    d.push({ plane: 'end', kind: 'vent', u: [-0.2, 0.2], v: [nb + 0.05, nt + 0.02], r: 0.12, range: [fz - 0.4, 99] });
    d.push({ plane: 'end', kind: 'vent', u: [nw * 0.45, nw * 0.9], v: [nb + 0.05, nb + nh * 0.62], r: 0.05, skew: 0.15, range: [fz - 0.4, 99] });
  } else {
    d.push({ plane: 'end', kind: 'vent', u: [-nw * 0.42, nw * 0.42], v: [nb + 0.05, nb + nh * (L.grilleH ?? 0.5)], r: 0.04, range: [fz - 0.4, 99] });
    d.push({ plane: 'end', kind: 'vent', u: [nw * 0.5, nw * 0.92], v: [nb + 0.05, nb + nh * 0.7], r: 0.05, skew: 0.25, range: [fz - 0.4, 99] });
  }
  // 頭燈：斜切的深色燈殼 + LED 光條
  const hz = fz - (L.headBack ?? 0.36), hx = hwAt(hz) * (L.headX ?? 0.72);
  const hs = L.headSkew ?? 0.45, hl = L.headLen ?? 0.2, hwid = L.headW ?? 0.1;
  d.push({ plane: 'top', kind: 'glass', u: [hz - hl, hz + hl], v: [hx - hwid, hx + hwid], r: 0.04, skew: hs, range: [0.15, 9] });
  d.push({ plane: 'top', kind: 'head', u: [hz - hl * 0.85, hz + hl * 0.85], v: [hx + hwid * 0.45, hx + hwid * 0.75], r: 0.01, skew: hs, range: [0.15, 9] });
  if (L.quad !== false) for (const k of [-0.45, 0.1]) d.push({ plane: 'top', kind: 'head', u: [hz + hl * k - 0.04, hz + hl * k + 0.04], v: [hx - hwid * 0.6, hx + hwid * 0.25], r: 0.03, skew: hs, range: [0.15, 9] });
  // 側面進氣口
  if (L.sideIntake !== false) {
    const z0 = L.intakeZ ? L.intakeZ[0] : s.rearAxleZ + 0.45, z1 = L.intakeZ ? L.intakeZ[1] : s.rearAxleZ + 1.25;
    const y0 = yb(z1) + 0.16, y1 = (yb(z1) + yt(z1)) / 2 + 0.12;
    d.push({ plane: 'side', kind: 'vent', u: [z0, z1], v: [y0, y1], r: 0.08, skew: L.intakeSkew ?? -0.22, range: [0.7, 9] });
  }
  // 引擎蓋通風口、引擎蓋板百葉
  if (L.hoodVents !== false) d.push({ plane: 'top', kind: 'vent', u: [fz - 1.05, fz - 0.72], v: [0.1, 0.36], r: 0.05, range: [0.2, 9] });
  if (L.louvers !== false) d.push({ plane: 'top', kind: 'vent', u: [rz + 0.35, rz + 0.95], v: [0.15, 0.55], r: 0.04, range: [0.3, 9] });
  if (L.accentStripe) d.push({ plane: 'top', kind: 'accent', u: [rz - 1, fz + 1], v: [0, 0.08], r: 0, range: [0.3, 9] });
  // 車尾：黑色面板、整條 LED 尾燈、擴散器
  const rb = yb(rz + 0.05), rt = yt(rz + 0.05), rw = hwAt(rz + 0.05);
  d.push({ plane: 'end', kind: 'carbon', u: [-rw, rw], v: [rb - 0.3, rb + (L.diffuserH ?? 0.2)], r: 0.03, range: [-99, rz + 0.5] });
  d.push({ plane: 'end', kind: 'black', u: [-rw * 0.95, rw * 0.95], v: [rt - 0.24, rt - 0.06], r: 0.05, range: [-99, rz + 0.14] });
  if (L.tail === 'split') for (const k of [0.25, 0.75]) d.push({ plane: 'end', kind: 'tail', u: [rw * k - 0.22, rw * k + 0.22], v: [rt - 0.17, rt - 0.12], r: 0.02, range: [-99, rz + 0.15] });
  else if (L.tail === 'ring') for (const k of [0.35, 0.72]) d.push({ plane: 'end', kind: 'tail', u: [rw * k - 0.09, rw * k + 0.09], v: [rt - 0.2, rt - 0.1], r: 0.05, range: [-99, rz + 0.15] });
  else d.push({ plane: 'end', kind: 'tail', u: [-rw * 0.9, rw * 0.9], v: [rt - 0.16, rt - 0.125], r: 0.015, range: [-99, rz + 0.15] });
  if (L.extra) d.push(...L.extra);
  return d;
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
  const hyper = s.style === 'hyper';
  // 車身烤漆 + 著色器貼花（雙色、燈組、進氣口），分界線俐落不受網格三角形影響
  let bodyPaint = M.paint;
  if (hyper || s.twoTone) {
    bodyPaint = decalMaterial(M.paint, s, hyper ? hyperDecals(s) : []);
    M.body = bodyPaint;
  }
  col_.add(body, bPaint, bodyPaint); col_.add(body, bTrim, M.trim);
  col_.add(body, buildWells(s), M.well);
  col_.add(body, buildCabin(s), s.roof === 'carbon' ? M.carbonRoof : s.roof === 'black' ? M.trimGloss : M.paint);
  for (const g of buildGlass(s)) col_.add(body, g, M.glass);

  const P = (type, pos, scale, mat, rot, group = body) => col_.add(group, UNIT[type], mat, trs(pos, scale, rot));
  const fz = s.frontZ, rz = s.rearZ;

  // 頭燈（超跑款式改用貼花）
  for (const side of hyper ? [] : [-1, 1]) {
    if (s.headLights === 'popup') {
      // 掀起式頭燈（升起狀態）
      const z = fz - 0.46;
      const x = smooth(s.bodyZ, s.bodyHalfWidth, z) * 0.6;
      const y = topY(s, z, x);
      P('cube', [side * x, y + 0.045, z], [0.4, 0.13, 0.25], M.paint);
      P('cube', [side * x, y + 0.05, z + 0.127], [0.37, 0.115, 0.01], M.trim);
      P('cube', [side * x, y + 0.05, z + 0.133], [0.33, 0.085, 0.01], M.head);
    } else if (s.headLights === 'slim') {
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
  // 復古車：黑色保桿、方向燈、水箱罩
  if (s.retro) {
    const zf = fz - 0.1, zr = rz + 0.1;
    const hf = smooth(s.bodyZ, s.bodyHalfWidth, zf), hr = smooth(s.bodyZ, s.bodyHalfWidth, zr);
    const yf = smooth(s.bodyZ, s.bodyBottom, zf), yr = smooth(s.bodyZ, s.bodyBottom, zr);
    P('cube', [0, yf + 0.11, zf + 0.04], [hf * 2.04, 0.15, 0.24], M.trim);
    P('cube', [0, yr + 0.1, zr - 0.04], [hr * 2.06, 0.15, 0.24], M.trim);
    P('cube', [0, yf + 0.25, fz - 0.02], [hf * 0.9, 0.04, 0.06], M.trim);
    for (const side of [-1, 1]) P('cube', [side * hf * 0.7, yf + 0.12, zf + 0.165], [0.2, 0.06, 0.01], M.amber);
  }
  // 前保桿進氣 / 下擾流（超跑只留碳纖維下擾流板）
  if (hyper) {
    const sz = fz - 0.2;
    P('cube', [0, smooth(s.bodyZ, s.bodyBottom, sz) - 0.012, sz + 0.06], [smooth(s.bodyZ, s.bodyHalfWidth, sz) * 1.9, 0.022, 0.4], M.carbon);
  } else if (!s.retro) {
    const z = fz - 0.08;
    const hw = smooth(s.bodyZ, s.bodyHalfWidth, z), yb = smooth(s.bodyZ, s.bodyBottom, z);
    P('sphere', [0, yb + 0.1, z], [hw * 1.1, 0.13, 0.16], M.trim);
    P('sphere', [-hw * 0.62, yb + 0.12, fz - 0.22], [0.42, 0.12, 0.22], M.trim);
    P('sphere', [hw * 0.62, yb + 0.12, fz - 0.22], [0.42, 0.12, 0.22], M.trim);
    const sz = fz - 0.25;
    P('cube', [0, smooth(s.bodyZ, s.bodyBottom, sz) - 0.005, sz], [smooth(s.bodyZ, s.bodyHalfWidth, sz) * 1.85, 0.025, 0.34], M.carbon);
  }
  // 側進氣口
  if (s.sideIntake && !hyper) {
    const z = s.sideIntakeZ;
    const y = lerp(smooth(s.bodyZ, s.bodyBottom, z), smooth(s.bodyZ, s.bodyTop, z), 0.5);
    const x = sideX(s, z, y);
    for (const side of [-1, 1]) P('sphere', [side * (x - 0.015), y, z], [0.07, 0.24, 0.62], M.trim, [0, side * 6, side * -4]);
  }
  // 側裙
  if (!s.retro) {
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
    for (const side of hyper ? [] : [-1, 1]) {
      if (s.tailLights === 'roundDouble') {
        for (const fx of [0.36, 0.62]) {
          P('cyl', [side * hw * fx, y, rz - 0.005], [0.18, 0.02, 0.18], M.trim, axisZ);
          P('cyl', [side * hw * fx, y, rz - 0.02], [0.145, 0.02, 0.145], M.tail, axisZ);
        }
      } else if (s.tailLights === 'roundSingle') {
        P('cyl', [side * hw * 0.5, y, rz - 0.005], [0.2, 0.02, 0.2], M.chrome, axisZ);
        P('cyl', [side * hw * 0.5, y, rz - 0.02], [0.16, 0.02, 0.16], M.tail, axisZ);
      } else if (s.tailLights === 'bar') {
        P('sphere', [side * hw * 0.42, y, rz + 0.01], [hw * 0.62, 0.06, 0.06], M.tail);
      }
    }
    if (s.tailLights === 'bar' && !hyper) P('cube', [0, y, rz + 0.005], [hw * 0.5, 0.012, 0.02], M.tail);
    if (s.tailLights === 'band') {
      // 橫貫車尾的寬版尾燈
      P('cube', [0, y - 0.03, rz - 0.004], [hw * 1.76, 0.15, 0.03], M.trim);
      for (const side of [-1, 1]) P('cube', [side * hw * 0.5, y - 0.03, rz - 0.012], [hw * 0.68, 0.11, 0.03], M.tail);
      for (const side of [-1, 1]) P('cube', [side * hw * 0.11, y - 0.03, rz - 0.012], [hw * 0.12, 0.11, 0.03], M.amber);
    }
    if (!s.retro) {
      const dz = rz + 0.18;
      const dyb = smooth(s.bodyZ, s.bodyBottom, dz);
      const dw = smooth(s.bodyZ, s.bodyHalfWidth, dz) * 1.45;
      P('cube', [0, dyb + 0.07, dz], [dw, 0.1, 0.38], M.carbon);
      for (let f = -2; f <= 2; f++) P('cube', [f * dw * 0.18, dyb + 0.06, dz - 0.03], [0.018, 0.1, 0.4], M.carbon);
    }
    const ey = s.retro ? yb - 0.03 : yb + 0.08;
    const xs = s.exhaustCount === 0 ? [] : s.exhaustCount >= 4 ? [-0.42, -0.28, 0.28, 0.42] : s.exhaustCount === 1 ? [-0.55] : s.exhaustCount === 3 ? [-0.14, 0, 0.14] : [-0.3, 0.3];
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

    // 超跑：大尺寸輪圈 + 低扁平比輪胎
    const rk = hyper ? 1.12 : 1, ti = hyper ? 0.79 : 0.7;
    col_.add(spinner, lathe([
      [-hw + 0.012, ti * R], [-hw, (ti + 0.06) * R], [-hw - 0.004, 0.9 * R], [-hw + 0.006, 0.96 * R], [-hw + 0.03, 0.993 * R], [-hw + 0.06, R],
      [hw - 0.06, R], [hw - 0.03, 0.993 * R], [hw - 0.006, 0.96 * R], [hw + 0.004, 0.9 * R], [hw, (ti + 0.06) * R], [hw - 0.012, ti * R],
    ], 40), M.tire);
    const fx = side * (hw - 0.03);
    col_.add(spinner, lathe([[-hw + 0.02, 0.66 * rk * R], [hw - 0.02, 0.66 * rk * R], [hw - 0.02, 0.71 * rk * R], [-hw + 0.02, 0.71 * rk * R], [-hw + 0.02, 0.66 * rk * R]], 32), M.rim);
    col_.add(spinner, lathe([[fx - side * 0.015, 0.6 * rk * R], [fx + side * 0.005, 0.62 * rk * R], [fx + side * 0.005, 0.72 * rk * R], [fx - side * 0.015, 0.73 * rk * R], [fx - side * 0.015, 0.6 * rk * R]], 40), M.rim);

    let count, width;
    if (s.rims === 'tenSpoke') { count = 10; width = 0.045; } else if (s.rims === 'wire') { count = 28; width = 0.008; } else if (s.rims === 'twinSpoke') { count = 14; width = 0.026; } else if (s.rims === 'aero') { count = 20; width = 0.05; } else { count = 10; width = 0.05; }
    for (let k = 0; k < count; k++) {
      const a = s.rims === 'fiveSpoke' ? Math.floor(k / 2) * 72 + (k % 2 === 0 ? -7 : 7) : s.rims === 'twinSpoke' ? Math.floor(k / 2) * 360 / 7 + (k % 2 === 0 ? -5 : 5) : k * 360 / count;
      const rad = a * D2R, rMid = 0.37 * rk * R;
      const tiltA = s.rims === 'wire' ? (k % 2 === 0 ? 12 : -12) : 0;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rad)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 6 * D2R)))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltA * D2R, 0, 0)));
      // 注意：Three.js 繞 X 軸正向旋轉把 +Y 轉向 +Z，與 (cos, sin) 擺放一致
      P('cube', [fx - side * 0.012, Math.cos(rad) * rMid, Math.sin(rad) * rMid], [0.028, 0.5 * rk * R, width], M.rim, q, spinner);
    }
    const axisX = [0, 0, 90];
    P('cyl', [fx - side * 0.01, 0, 0], [0.26 * R, 0.03, 0.26 * R], M.rim, axisX, spinner);
    P('cyl', [fx + side * 0.004, 0, 0], [0.12 * R, 0.01, 0.12 * R], M.disc, axisX, spinner);
    P('cyl', [-side * 0.02, 0, 0], [1.18 * rk * R, 0.014, 1.18 * rk * R], M.disc, axisX, spinner);
    P('cube', [side * 0.005, 0.38 * rk * R, (front ? -1 : 1) * 0.26 * rk * R], [0.07, 0.24 * R, 0.42 * R], M.caliper, [(front ? 1 : -1) * 35, 0, 0], pivot);
  }

  col_.build(shadows);

  return {
    root, body, pivots, spinners, anchors,
    brake: M.tail, paint: M.paint,
    setPaint(c) { M.paint.color.copy(col(c)); if (M.body) M.body.color.copy(M.paint.color); },
    setBrake(on) {
      M.tail.emissive.setRGB(on ? 6 : 0.9, on ? 0.12 : 0.02, on ? 0.1 : 0.02);
      if (M.body && M.body.userData.uni) M.body.userData.uni.uBrake.value = on ? 1 : 0;
    },
    dispose() {
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      Object.values(M).forEach((m) => m.dispose());
    },
  };
}
