// 賽道：Catmull-Rom 中心線、柏油路面、W 型護欄、地形、樹林與五燈起跑燈號。
// circuit：路緣石、碎石緩衝區、維修區、看台、廣告看板。
// mountain：有高低落差的窄山路、白色邊線 + 中線、下坡側護欄 / 上坡側擋土牆、彎道指示牌、山脈地形。
// 也提供最近點 / 側向距離 / 路面高度查詢。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACKS } from './data.js';

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 簡易值雜訊
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2; } return s; }

function canvasTex(w, h, draw, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function noiseFill(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export class Track {
  constructor(scene, { quality = 'high', def = TRACKS[0] } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.def = def;
    this.mountain = def.type === 'mountain';
    this.scale = def.scale ?? 1.45;
    this.halfWidth = def.halfWidth ?? 7.5;
    this.curbWidth = this.mountain ? 0.8 : 1.2;      // 山路：路肩
    this.gravelWidth = this.mountain ? 0 : 5;
    this.barrierOffset = this.mountain ? this.halfWidth + 2 : 20;
    this.spacing = 2;
    this.checkpointCount = 10;
    this.checkpointZone = 15;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.obstacles = []; // 圓形障礙物（龍門架柱子）{x, z, r}

    this.generatePath();
    this.computeBarriers();
    if (this.mountain) {
      this.buildHeightField();
      this.buildMountainTerrain();
      this.buildMountainRoad();
      this.buildMountainBarriers();
      this.buildStart();
      this.buildSigns();
    } else {
      this.buildTerrain();
      this.buildRoad();
      this.buildBarriers();
      this.buildStart();
      this.buildBuildings();
    }
    this.buildTrees();
    this.checkpoints = [];
    for (let i = 0; i < this.checkpointCount; i++) this.checkpoints.push(Math.floor(i * this.count / this.checkpointCount));
    this.setStartLights(0);
  }

  get startIndex() { return this.wrap(-8); }
  wrap(i) { return ((i % this.count) + this.count) % this.count; }
  wrapN(i, n) { return ((i % n) + n) % n; }

  // ---------------- 路徑 ----------------
  generatePath() {
    const s = this.scale;
    const ctrl = this.def.control.map(([x, z, y = 0]) => new THREE.Vector3(x * s, y, z * s));
    const curve = new THREE.CatmullRomCurve3(ctrl, true, this.mountain ? 'centripetal' : 'catmullrom', 0.5);
    const total = curve.getLength();
    this.totalLength = total;
    this.count = Math.max(32, Math.round(total / this.spacing));
    const pts = curve.getSpacedPoints(this.count).slice(0, this.count);
    if (this.mountain) {
      // 高度平滑：避免路面忽高忽低
      let ys = pts.map((p) => p.y);
      for (let pass = 0; pass < 8; pass++) ys = ys.map((_, i) => { let a = 0; for (let o = -5; o <= 5; o++) a += ys[this.wrapN(i + o, ys.length)]; return a / 11; });
      pts.forEach((p, i) => { p.y = ys[i]; });
    }
    this.points = pts;
    this.dist = pts.map((_, i) => i * total / this.count);
    this.tangents = []; this.rights = []; this.slopes = [];
    for (let i = 0; i < this.count; i++) {
      const t = new THREE.Vector3().subVectors(pts[this.wrap(i + 1)], pts[this.wrap(i - 1)]);
      const hl = Math.hypot(t.x, t.z);
      this.slopes.push(t.y / hl);               // 坡度 dy / 水平距離
      t.y = 0; t.normalize();                    // 水平切線（物理與查詢都用水平面）
      this.tangents.push(t);
      this.rights.push(new THREE.Vector3(-t.z, 0, t.x)); // 行進方向的右手邊（俯視 x 右 z 下時）
    }
    // 讓 right 與賽車的「畫面右方」一致：car right = (-cos h, sin h) 而 f=(sin h, cos h) → right = (-f.z, f.x)
    this.curvature = [];
    for (let i = 0; i < this.count; i++) {
      const a = this.tangents[this.wrap(i - 2)], b = this.tangents[this.wrap(i + 2)];
      const cross = a.x * b.z - a.z * b.x; // >0 代表向右彎（以 right 定義）
      const ang = Math.atan2(-cross, a.x * b.x + a.z * b.z);
      this.curvature.push(ang / (4 * total / this.count));
    }
    const box = new THREE.Box3().setFromPoints(pts);
    this.bounds = box;
  }

  computeBarriers() {
    const minOff = this.halfWidth + this.curbWidth + this.gravelWidth;
    let L = [], R = [];
    for (let i = 0; i < this.count; i++) {
      const k = this.curvature[i];
      const r = Math.abs(k) > 1e-4 ? 1 / Math.abs(k) : 1e4;
      const inner = Math.max(minOff, Math.min(this.barrierOffset, r * 0.8));
      // 曲率 > 0 = 向左彎（內側在左邊）
      L.push(k > 0 ? inner : this.barrierOffset);
      R.push(k < 0 ? inner : this.barrierOffset);
    }
    const smin = (a) => a.map((v, i) => Math.min(v, (a[this.wrap(i - 1)] + v + a[this.wrap(i + 1)]) / 3 + 0.5));
    for (let p = 0; p < 12; p++) { L = smin(L); R = smin(R); }
    this.leftBarrier = L; this.rightBarrier = R;
  }

  // ---------------- 查詢 ----------------
  findNearest(x, z, hint = -1, window = 0) {
    let best = 0, bd = Infinity;
    const test = (i) => { const p = this.points[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } };
    if (hint < 0 || window <= 0 || window * 2 >= this.count) for (let i = 0; i < this.count; i++) test(i);
    else for (let o = -window; o <= window; o++) test(this.wrap(hint + o));
    return { index: best, sqr: bd };
  }
  lateral(x, z, i) {
    const p = this.points[i], r = this.rights[i];
    return (x - p.x) * r.x + (z - p.z) * r.z;
  }
  /** 路面高度（沿切線用坡度內插）與坡度向量 */
  roadAt(x, z, i, out = { y: 0, gx: 0, gz: 0 }) {
    const p = this.points[i], t = this.tangents[i], sl = this.slopes[i];
    const along = (x - p.x) * t.x + (z - p.z) * t.z;
    out.y = p.y + along * sl;
    out.gx = t.x * sl; out.gz = t.z * sl;
    return out;
  }
  /** 任意位置的地面高度（給鏡頭避免穿進山壁用） */
  groundAt(x, z) { return this.mountain ? this.terrainH(x, z) : 0; }

  setStartLights(on) {
    if (!this.lights) return;
    this.lights.forEach((m, i) => m.emissive.setRGB(i < on ? 8 : 0.05, i < on ? 0.15 : 0, i < on ? 0.08 : 0));
  }

  // ---------------- 網格工具 ----------------
  strip(edgeA, edgeB, uA, uB, vPerMeter, y = 0, mask = null) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= this.count; j++) {
      const i = j % this.count;
      const v = (j === this.count ? this.totalLength : this.dist[i]) * vPerMeter;
      const a = edgeA(i), b = edgeB(i);
      pos.push(a.x, a.y + y, a.z, b.x, b.y + y, b.z);
      uv.push(uA, v, uB, v);
    }
    for (let j = 0; j < this.count; j++) {
      if (mask && !(mask[j % this.count] && mask[(j + 1) % this.count])) continue;
      const a = j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // 確保法線朝上
    const n = g.getAttribute('normal');
    if (n.count && n.getY(0) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  }
  edge(i, off) { const p = this.points[i], r = this.rights[i]; return new THREE.Vector3(p.x + r.x * off, p.y, p.z + r.z * off); }
  mesh(geo, mat, { cast = false, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  // ---------------- 地形 ----------------
  buildTerrain() {
    const size = 2600, seg = this.quality === 'low' ? 110 : 170;
    const c = this.bounds.getCenter(new THREE.Vector3());
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const sample = [];
    for (let i = 0; i < this.count; i += 4) sample.push(this.points[i]);
    const grass = new THREE.Color(0.16, 0.30, 0.09), dry = new THREE.Color(0.40, 0.38, 0.20), rock = new THREE.Color(0.42, 0.41, 0.38);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + c.x, z = pos.getZ(i) + c.z;
      let d2 = Infinity;
      for (const p of sample) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < d2) d2 = d; }
      const d = Math.sqrt(d2);
      const hills = fbm(x * 0.0035 + 17, z * 0.0035 + 3, 3) * 0.75 + vnoise(x * 0.011, z * 0.011) * 0.3;
      const near = sstep(70, 280, d), far = sstep(650, 1150, d);
      const h = near * (4 + hills * 34) + far * (50 + hills * 170);
      pos.setXYZ(i, x, h - 0.06, z);
      const n = vnoise(x * 0.006 + 50, z * 0.006 + 50);
      const rk = sstep(60, 150, h);
      const dr = sstep(0.55, 0.75, n) * 0.8 * (1 - rk);
      tmp.copy(grass).lerp(dry, dr).lerp(rock, rk);
      const v = 0.9 + hash(x, z) * 0.15;
      colors[i * 3] = tmp.r * v; colors[i * 3 + 1] = tmp.g * v; colors[i * 3 + 2] = tmp.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const detail = canvasTex(256, 256, (ctx, w, h) => noiseFill(ctx, w, h, (x, y) => {
      const blade = vnoise(x * 0.9, y * 0.12), big = fbm(x * 0.03, y * 0.03, 3);
      const v = 150 + (big - 0.5) * 120 + (blade - 0.5) * 60 + (hash(x, y) - 0.5) * 50;
      return [v, v, v];
    }), { srgb: false });
    detail.repeat.set(size / 6, size / 6);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 });
    this.mesh(geo, mat);
  }

  // ---------------- 路面 ----------------
  buildRoad() {
    const asphalt = canvasTex(256, 512, (ctx, w, h) => {
      noiseFill(ctx, w, h, (x, y) => {
        const n = fbm(x * 0.05, y * 0.05, 3) * 0.6 + hash(x, y) * 0.4;
        const v = 52 + n * 36;
        return [v, v, v + 2];
      });
      ctx.fillStyle = 'rgba(240,240,235,0.92)';
      ctx.fillRect(w * 0.022, 0, w * 0.023, h);
      ctx.fillRect(w * 0.955, 0, w * 0.023, h);
      // 輪胎磨痕
      ctx.fillStyle = 'rgba(20,20,20,0.12)';
      ctx.fillRect(w * 0.3, 0, w * 0.08, h); ctx.fillRect(w * 0.62, 0, w * 0.08, h);
    });
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.82, metalness: 0 });
    const hw = this.halfWidth;
    this.mesh(this.strip((i) => this.edge(i, -hw), (i) => this.edge(i, hw), 0, 1, 1 / 14, 0.02), roadMat);

    const gravel = canvasTex(256, 256, (ctx, w, h) => noiseFill(ctx, w, h, (x, y) => {
      const v = 150 + (hash(x, y) - 0.5) * 90 + (vnoise(x * 0.2, y * 0.2) - 0.5) * 50;
      return [v * 0.95, v * 0.86, v * 0.7];
    }));
    const gravelMat = new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 });
    const gOut = hw + this.curbWidth + this.gravelWidth;
    this.mesh(this.strip((i) => this.edge(i, -gOut), (i) => this.edge(i, -hw), 0, 3, 1 / 4, 0.012), gravelMat);
    this.mesh(this.strip((i) => this.edge(i, hw), (i) => this.edge(i, gOut), 0, 3, 1 / 4, 0.012), gravelMat);

    const mask = new Array(this.count).fill(false);
    for (let i = 0; i < this.count; i++) if (Math.abs(this.curvature[i]) > 1 / 230) for (let o = -12; o <= 12; o++) mask[this.wrap(i + o)] = true;
    const curb = canvasTex(16, 64, (ctx, w, h) => { ctx.fillStyle = '#e8e8e4'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c01410'; ctx.fillRect(0, 0, w, h / 2); }, { aniso: 4 });
    const curbMat = new THREE.MeshStandardMaterial({ map: curb, roughness: 0.6 });
    const cw = this.curbWidth;
    this.mesh(this.strip((i) => this.edge(i, -hw - cw), (i) => this.edge(i, -hw), 0, 1, 1 / 6, 0.035, mask), curbMat);
    this.mesh(this.strip((i) => this.edge(i, hw), (i) => this.edge(i, hw + cw), 0, 1, 1 / 6, 0.035, mask), curbMat);
  }

  // ---------------- 護欄 ----------------
  buildBarriers() {
    const prof = [[0, 0.42], [0.06, 0.49], [0.02, 0.57], [0.06, 0.65], [0, 0.73]];
    const steel = new THREE.MeshStandardMaterial({ color: 0xa8acb0, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const offs = side < 0 ? this.leftBarrier : this.rightBarrier;
      const pos = [], idx = [];
      const k = prof.length;
      for (let j = 0; j <= this.count; j++) {
        const i = j % this.count;
        for (const [d, y] of prof) { const e = this.edge(i, side * (offs[i] + d)); pos.push(e.x, e.y + y, e.z); }
      }
      for (let j = 0; j < this.count; j++) for (let p = 0; p < k - 1; p++) {
        const a = j * k + p, b = a + 1, c = a + k, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.mesh(g, steel, { cast: true });
    }
    // 立柱（InstancedMesh）
    const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6e7074, roughness: 0.5, metalness: 0.7 });
    const n = Math.ceil(this.count / 2) * 2;
    const inst = new THREE.InstancedMesh(postGeo, postMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    let c = 0;
    for (let i = 0; i < this.count; i += 2) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.tangents[i].x, this.tangents[i].z));
      for (const side of [-1, 1]) {
        const off = side < 0 ? this.leftBarrier[i] : this.rightBarrier[i];
        const e = this.edge(i, side * (off + 0.14));
        m.compose(new THREE.Vector3(e.x, 0.4, e.z), q, s);
        inst.setMatrixAt(c++, m);
      }
    }
    inst.count = c;
    this.group.add(inst);
  }

  // ---------------- 起跑區 ----------------
  buildStart() {
    const p = this.points[0], t = this.tangents[0], r = this.rights[0];
    const yaw = Math.atan2(t.x, t.z);
    const hw = this.halfWidth;
    const checker = canvasTex(64, 8, (ctx, w, h) => {
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { ctx.fillStyle = ((x + y) / 4) % 2 ? '#111' : '#eee'; ctx.fillRect(x, y, 4, 4); }
    }, { repeat: false, aniso: 4 });
    checker.magFilter = THREE.NearestFilter;
    const mask = new Array(this.count).fill(false); mask[0] = mask[1] = true;
    this.mesh(this.strip((i) => this.edge(i, -hw), (i) => this.edge(i, hw), 0, 1, 0.5, 0.04, mask),
      new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

    // 起跑格線
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.6 });
    const gridGeo = [];
    for (let g = 0; g < (this.mountain ? 0 : 6); g++) {
      const idx = this.wrap(-6 - g * 5);
      const side = g % 2 === 0 ? -1 : 1;
      const gp = this.edge(idx, side * hw * 0.45);
      const gy = Math.atan2(this.tangents[idx].x, this.tangents[idx].z);
      const a = new THREE.BoxGeometry(3, 0.01, 0.18); a.rotateY(gy); a.translate(gp.x, 0.035, gp.z);
      const sp = this.edge(idx, side * (hw * 0.45 + 1.45));
      const b = new THREE.BoxGeometry(0.15, 0.01, 1.2); b.rotateY(gy);
      b.translate(sp.x - this.tangents[idx].x * 0.6, 0.035, sp.z - this.tangents[idx].z * 0.6);
      gridGeo.push(a, b);
    }
    if (gridGeo.length) this.group.add(new THREE.Mesh(mergeGeometries(gridGeo), white));

    // 龍門架 + 五顆起跑燈
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.75 });
    const px = hw + this.curbWidth + 3;
    const gantry = new THREE.Group();
    gantry.position.set(p.x, p.y, p.z);
    gantry.rotation.y = yaw;
    this.group.add(gantry);
    const box = (w, h, d, x, y, z, mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; gantry.add(b); return b; };
    // gantry 的本地 -x 是賽道右方（與賽車同樣的慣例）
    for (const s of [-1, 1]) {
      box(0.9, 8, 0.9, s * px, 4, 0, metal);
      const wp = this.edge(0, -s * px);
      this.obstacles.push({ x: wp.x, z: wp.z, r: 0.75 });
    }
    box(px * 2 + 0.9, 1.1, 0.9, 0, 8.2, 0, metal);
    const banner = canvasTex(512, 32, (ctx, w, h) => {
      ctx.fillStyle = '#0c0c10'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('START · FINISH', w / 2, h / 2 + 1);
    }, { repeat: false });
    const ban = box(px * 2 - 1, 0.8, 0.02, 0, 8.2, -0.47, new THREE.MeshStandardMaterial({ map: banner, roughness: 0.5 }));
    ban.rotation.y = Math.PI;
    box(3.4, 0.9, 0.35, 0, 6.9, -0.1, new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5 }));
    this.lights = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x400505, emissive: 0x000000, roughness: 0.3 });
      this.lights.push(m);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 20), m);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set((2 - i) * 0.62, 6.9, -0.3); // 本地 +x 是左方：由左至右亮起
      gantry.add(lamp);
    }
  }

  // ---------------- 建築 ----------------
  buildBuildings() {
    const p = this.points[0], t = this.tangents[0], r = this.rights[0];
    const yaw = Math.atan2(t.x, t.z);
    const concrete = new THREE.MeshStandardMaterial({ color: 0xbdbdb8, roughness: 0.85 });
    const darkC = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.08, metalness: 0.7 });
    const door = new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.5, metalness: 0.5 });
    const asph = new THREE.MeshStandardMaterial({ color: 0x29292b, roughness: 0.9 });
    const geos = new Map();
    const add = (mat, w, h, d, lx, ly, lz, extraYaw = 0, roll = 0) => {
      // lx: 往賽道右方的距離, lz: 沿賽道前進方向
      const g = new THREE.BoxGeometry(w, h, d);
      if (roll) g.rotateZ(roll);
      g.rotateY(yaw + extraYaw);
      g.translate(p.x + r.x * lx + t.x * lz, ly, p.z + r.z * lx + t.z * lz);
      if (!geos.has(mat)) geos.set(mat, []);
      geos.get(mat).push(g);
    };
    // 維修區（左側）
    const L = -1;
    const pitOff = this.leftBarrier[0] + 18;
    add(asph, 11, 0.02, 170, L * (this.leftBarrier[0] + 6), 0.01, 10);
    add(concrete, 14, 9, 160, L * pitOff, 4.5, 10);
    add(glass, 0.1, 2.6, 158, L * (pitOff - 7.05), 6.6, 10);
    add(darkC, 19, 0.45, 164, L * (pitOff - 2), 9.2, 10);
    for (let g = 0; g < 14; g++) add(door, 0.1, 3.6, 8.2, L * (pitOff - 7.02), 2, 10 - 70 + g * 10.8);
    // 看台（右側）
    const seatR = new THREE.MeshStandardMaterial({ color: 0xbf1410, roughness: 0.6 });
    const seatW = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.6 });
    const standOff = this.rightBarrier[0] + 7;
    const rows = 12;
    for (let k = 0; k < rows; k++) {
      const h = 0.8 + k * 0.75, x = standOff + k * 1.4;
      add(concrete, 1.4, h, 110, x, h / 2, -15);
      add(k % 2 ? seatW : seatR, 0.6, 0.4, 109, x - 0.2, h + 0.2, -15);
    }
    const topH = 0.8 + rows * 0.75, back = standOff + rows * 1.4;
    add(darkC, 0.6, topH + 5, 110, back, (topH + 5) / 2, -15);
    add(darkC, rows * 1.4 + 6, 0.4, 114, standOff + rows * 0.7, topH + 5, -15);
    for (let c = 0; c < 6; c++) add(darkC, 0.5, topH + 5, 0.5, back - 0.5, (topH + 5) / 2, -15 - 50 + c * 20);
    for (const [mat, list] of geos) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }

    // 廣告看板（虛構品牌）
    const brands = [['VELOCE OIL', '#d81b12', '#fff'], ['NOVA TYRES', '#0b2f8a', '#ffcc1a'], ['APEX TIMING', '#151515', '#33e07a'], ['SOLARE', '#f2bd0d', '#111']];
    const adMats = brands.map(([txt, bg, fg]) => new THREE.MeshStandardMaterial({
      roughness: 0.5,
      map: canvasTex(256, 48, (ctx, w, h) => {
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = fg; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, w / 2, h / 2 + 2);
      }, { repeat: false }),
    }));
    const adGeo = new THREE.BoxGeometry(7, 1.3, 0.12);
    let n = 0;
    for (let i = 0; i < this.count; i += 9) {
      if (Math.abs(this.curvature[i]) > 1 / 400) continue;
      if (i > this.count / 12 && i < this.count - this.count / 12 && (i / 9) % 3 !== 0) continue;
      for (const side of [-1, 1]) {
        const off = (side < 0 ? this.leftBarrier[i] : this.rightBarrier[i]) + 1.4;
        const e = this.edge(i, side * off);
        const ad = new THREE.Mesh(adGeo, adMats[n++ % adMats.length]);
        ad.position.set(e.x, 1.0, e.z);
        // 看板正面朝向賽道
        ad.rotation.y = Math.atan2(-this.rights[i].x * side, -this.rights[i].z * side);
        this.group.add(ad);
      }
    }
  }

  // ================= 山路 =================
  /** 把路面取樣點放進格子，方便快速查詢附近的路 */
  buildHeightField() {
    const cell = 25;
    this.hfCell = cell;
    this.hfBuckets = new Map();
    this.hfSamples = [];
    let sum = 0;
    for (let i = 0; i < this.count; i += 3) {
      const p = this.points[i];
      const smp = { x: p.x, z: p.z, y: p.y, i };
      this.hfSamples.push(smp);
      sum += p.y;
      const k = Math.floor(p.x / cell) + ',' + Math.floor(p.z / cell);
      if (!this.hfBuckets.has(k)) this.hfBuckets.set(k, []);
      this.hfBuckets.get(k).push(smp);
    }
    this.meanY = sum / this.hfSamples.length;
    this.minY = Math.min(...this.points.map((p) => p.y));
  }
  /** 回傳 { d: 與路中心距離, y: 最近路面高度, base: 平滑後的周邊高度, i: 最近點 } */
  roadInfo(x, z) {
    const cell = this.hfCell, R = 110, sig2 = 2 * 32 * 32;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell), rc = Math.ceil(R / cell);
    let best = null, bd = Infinity, wsum = 0.004, hsum = 0.004 * this.meanY;
    for (let a = -rc; a <= rc; a++) for (let b = -rc; b <= rc; b++) {
      const list = this.hfBuckets.get((cx + a) + ',' + (cz + b));
      if (!list) continue;
      for (const s of list) {
        const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d2 < bd) { bd = d2; best = s; }
        if (d2 < R * R) { const w = Math.exp(-d2 / sig2); wsum += w; hsum += w * s.y; }
      }
    }
    const base = hsum / wsum;
    if (!best) {
      // 視窗內沒有路：掃全部取樣點求真實距離（只發生在遠處地形）
      for (const s of this.hfSamples) { const d2 = (s.x - x) ** 2 + (s.z - z) ** 2; if (d2 < bd) { bd = d2; best = s; } }
      return { d: Math.sqrt(bd), y: best.y, base, i: best.i };
    }
    // 在完整點列上細找最近點
    let bi = best.i, bd2 = Infinity;
    for (let o = -3; o <= 3; o++) {
      const i = this.wrap(best.i + o), p = this.points[i];
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < bd2) { bd2 = d2; bi = i; }
    }
    const y = this.roadAt(x, z, bi, {}).y;
    return { d: Math.sqrt(bd2), y, base, i: bi };
  }
  terrainH(x, z) {
    const info = this.roadInfo(x, z);
    const d = info.d, hw = this.halfWidth;
    const n1 = fbm(x * 0.004 + 11, z * 0.004 + 5, 4);
    const n2 = vnoise(x * 0.02 + 3, z * 0.02 + 9);
    const rough = sstep(hw + 4, hw + 70, d);
    const ridge = 1 - Math.abs(vnoise(x * 0.0025 + 40, z * 0.0025 + 8) * 2 - 1); // 山脊
    const h = info.base + rough * ((n1 - 0.45) * 40 + (n2 - 0.5) * 6) + sstep(220, 1100, d) * (n1 * 150 + ridge * 120 - 20);
    const blend = sstep(hw + 2.6, hw + 15, d);
    return lerp(info.y - 0.3, h, blend);
  }

  buildMountainTerrain() {
    const b = this.bounds, margin = 130, step = this.quality === 'low' ? 6 : 4;
    const axis = (lo, hi) => {
      const out = [];
      let v = lo - 1500;
      // 外圍稀疏、賽道附近密集
      while (v < lo - margin) { out.push(v); v += Math.max(step, Math.min(80, (lo - margin - v) * 0.12)); }
      for (v = lo - margin; v < hi + margin; v += step) out.push(v);
      v = hi + margin;
      while (v < hi + 1500) { out.push(v); v += Math.max(step, Math.min(80, (v - hi - margin) * 0.12 + step)); }
      out.push(hi + 1500);
      return out;
    };
    const xs = axis(b.min.x, b.max.x), zs = axis(b.min.z, b.max.z);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), colors = new Float32Array(nx * nz * 3), uvs = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      pos[v * 3] = xs[i]; pos[v * 3 + 1] = this.terrainH(xs[i], zs[j]); pos[v * 3 + 2] = zs[j];
      uvs[v * 2] = xs[i] / 6; uvs[v * 2 + 1] = zs[j] / 6;
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b2 = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b2, b2, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.getAttribute('normal');
    const autumn = this.def.time === 'autumn';
    const grass = autumn ? new THREE.Color(0.30, 0.22, 0.08) : new THREE.Color(0.11, 0.22, 0.07);
    const forest = autumn ? new THREE.Color(0.34, 0.12, 0.04) : new THREE.Color(0.06, 0.15, 0.05);
    const rock = new THREE.Color(0.33, 0.31, 0.28), snow = new THREE.Color(0.8, 0.82, 0.85);
    const tmp = new THREE.Color();
    for (let v = 0; v < nx * nz; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const steep = sstep(0.72, 0.5, nrm.getY(v));
      const n = vnoise(x * 0.008 + 50, z * 0.008 + 50);
      tmp.copy(grass).lerp(forest, sstep(0.35, 0.7, n)).lerp(rock, steep).lerp(snow, sstep(230, 300, y - this.minY) * (1 - steep * 0.6));
      const s = 0.85 + hash(x, z) * 0.2;
      colors[v * 3] = tmp.r * s; colors[v * 3 + 1] = tmp.g * s; colors[v * 3 + 2] = tmp.b * s;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const detail = canvasTex(256, 256, (ctx, w, h) => noiseFill(ctx, w, h, (x, y) => {
      const v = 150 + (fbm(x * 0.03, y * 0.03, 3) - 0.5) * 120 + (vnoise(x * 0.9, y * 0.12) - 0.5) * 50 + (hash(x, y) - 0.5) * 50;
      return [v, v, v];
    }), { srgb: false });
    this.mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95 }));
  }

  buildMountainRoad() {
    const asphalt = canvasTex(256, 512, (ctx, w, h) => {
      noiseFill(ctx, w, h, (x, y) => {
        const n = fbm(x * 0.05, y * 0.05, 3) * 0.6 + hash(x, y) * 0.4;
        const v = 46 + n * 34;
        return [v, v, v + 2];
      });
      ctx.fillStyle = 'rgba(235,235,230,0.9)';
      ctx.fillRect(w * 0.03, 0, w * 0.03, h); ctx.fillRect(w * 0.94, 0, w * 0.03, h);
      ctx.fillStyle = 'rgba(240,190,40,0.9)'; // 中央黃色虛線
      ctx.fillRect(w * 0.49, 0, w * 0.025, h * 0.5);
      ctx.fillStyle = 'rgba(15,15,15,0.14)';
      ctx.fillRect(w * 0.2, 0, w * 0.07, h); ctx.fillRect(w * 0.73, 0, w * 0.07, h);
    });
    const hw = this.halfWidth;
    const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mesh(this.strip((i) => this.edge(i, -hw), (i) => this.edge(i, hw), 0, 1, 1 / 12, 0.02), roadMat);
    const dirt = canvasTex(256, 256, (ctx, w, h) => noiseFill(ctx, w, h, (x, y) => {
      const v = 110 + (hash(x, y) - 0.5) * 80 + (vnoise(x * 0.2, y * 0.2) - 0.5) * 40;
      return [v * 0.8, v * 0.74, v * 0.62];
    }));
    const dirtMat = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 });
    this.mesh(this.strip((i) => this.edge(i, -(this.leftBarrier[i] + 0.6)), (i) => this.edge(i, -hw), 0, 2, 1 / 4, 0.0), dirtMat);
    this.mesh(this.strip((i) => this.edge(i, hw), (i) => this.edge(i, this.rightBarrier[i] + 0.6), 0, 2, 1 / 4, 0.0), dirtMat);
  }

  /** 沿賽道一側擠出剖面（護欄 / 擋土牆）；use[i] 決定哪些段要建 */
  extrude(side, prof, use, mat) {
    const offs = side < 0 ? this.leftBarrier : this.rightBarrier;
    const pos = [], idx = [], k = prof.length;
    for (let j = 0; j <= this.count; j++) {
      const i = j % this.count;
      for (const [d, y] of prof) { const e = this.edge(i, side * (offs[i] + d)); pos.push(e.x, e.y + y, e.z); }
    }
    for (let j = 0; j < this.count; j++) {
      if (!use[j] || !use[(j + 1) % this.count]) continue;
      for (let p = 0; p < k - 1; p++) {
        const a = j * k + p, b = a + 1, c = a + k, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return this.mesh(g, mat, { cast: true });
  }

  buildMountainBarriers() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xb4b8bc, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8984, roughness: 0.9, side: THREE.DoubleSide });
    const rail = [[0, 0.42], [0.06, 0.49], [0.02, 0.57], [0.06, 0.65], [0, 0.73]];
    const wallP = [[0.05, -0.6], [0, 0.05], [0.02, 1.0], [0.35, 1.05], [0.9, 1.6]];
    const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.6 });
    const posts = [], reflect = [];
    for (const side of [-1, 1]) {
      const offs = side < 0 ? this.leftBarrier : this.rightBarrier;
      // 上坡側（地形明顯高於路面）用擋土牆，其餘用護欄
      let wall = new Array(this.count).fill(false);
      for (let i = 0; i < this.count; i += 2) {
        const e = this.edge(i, side * (offs[i] + 6));
        const hi = this.terrainH(e.x, e.z) > this.points[i].y + 1.2;
        wall[i] = hi; wall[this.wrap(i + 1)] = hi;
      }
      // 去掉零碎片段
      for (let pass = 0; pass < 2; pass++) { const w0 = wall; wall = w0.map((v, i) => { let c = 0; for (let o = -4; o <= 4; o++) c += w0[this.wrap(i + o)] ? 1 : 0; return c >= 5; }); }
      const railUse = wall.map((w, i) => !w || !wall[this.wrap(i + 1)] || !wall[this.wrap(i - 1)]);
      this.extrude(side, rail, railUse, steel);
      this.extrude(side, wallP, wall, concrete);
      for (let i = 0; i < this.count; i += 2) {
        if (wall[i]) continue;
        const e = this.edge(i, side * (offs[i] + 0.14));
        const yaw = Math.atan2(this.tangents[i].x, this.tangents[i].z);
        posts.push({ x: e.x, y: e.y + 0.4, z: e.z, yaw });
        if (i % 8 === 0) reflect.push({ x: e.x, y: e.y + 0.86, z: e.z, yaw });
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const inst = new THREE.InstancedMesh(postGeo, postMat, Math.max(1, posts.length));
    posts.forEach((p, k) => { q.setFromAxisAngle(up, p.yaw); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one); inst.setMatrixAt(k, m); });
    inst.count = posts.length;
    this.group.add(inst);
    // 反光片（夜間很亮）
    const night = this.def.time === 'night';
    const refMat = new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8a10, emissiveIntensity: night ? 1.6 : 0.3, roughness: 0.3 });
    const ref = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), refMat, Math.max(1, reflect.length));
    reflect.forEach((p, k) => { q.setFromAxisAngle(up, p.yaw); m.compose(new THREE.Vector3(p.x, p.y, p.z), q, one); ref.setMatrixAt(k, m); });
    ref.count = reflect.length;
    this.group.add(ref);
  }

  /** 急彎外側的箭頭指示牌（箭頭指向前進方向） */
  buildSigns() {
    const night = this.def.time === 'night';
    const mk = (dir) => {
      const map = canvasTex(128, 64, (ctx, w, h) => {
        ctx.fillStyle = '#f5c518'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#111';
        for (let k = 0; k < 3; k++) {
          const x0 = 10 + k * 38;
          ctx.beginPath();
          if (dir > 0) { ctx.moveTo(x0, 10); ctx.lineTo(x0 + 26, 32); ctx.lineTo(x0, 54); ctx.lineTo(x0 + 10, 54); ctx.lineTo(x0 + 36, 32); ctx.lineTo(x0 + 10, 10); }
          else { ctx.moveTo(x0 + 36, 10); ctx.lineTo(x0 + 10, 32); ctx.lineTo(x0 + 36, 54); ctx.lineTo(x0 + 26, 54); ctx.lineTo(x0, 32); ctx.lineTo(x0 + 26, 10); }
          ctx.fill();
        }
      }, { repeat: false });
      return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: new THREE.Color(night ? 0.45 : 0, night ? 0.45 : 0, night ? 0.45 : 0), roughness: 0.5 });
    };
    const left = mk(-1), right = mk(1);
    const geo = new THREE.BoxGeometry(1.6, 0.8, 0.06);
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6, metalness: 0.5 });
    let last = -99;
    for (let i = 0; i < this.count; i += 3) {
      const k = this.curvature[i];
      if (Math.abs(k) < 1 / 45 || i - last < 9) continue;
      last = i;
      const side = k > 0 ? 1 : -1; // 彎道外側
      const offs = side < 0 ? this.leftBarrier : this.rightBarrier;
      const e = this.edge(i, side * (offs[i] + 0.5));
      const r = this.rights[i];
      // 看板正面朝向路面；從路面看過去，前進方向在右側外側牌的左邊
      const sign = new THREE.Mesh(geo, side > 0 ? left : right);
      sign.position.set(e.x, e.y + 1.5, e.z);
      sign.rotation.y = Math.atan2(-r.x * side, -r.z * side);
      this.group.add(sign);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(e.x, e.y + 0.6, e.z);
      this.group.add(pole);
    }
  }

  // ---------------- 樹林 ----------------
  buildTrees() {
    const mtn = this.mountain;
    const target = (this.quality === 'low' ? 260 : 520) * (mtn ? 1.8 : 1);
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.26, 6.8, 6); trunkGeo.translate(0, 3.1, 0);
    const pineParts = [];
    for (let c = 0; c < 5; c++) { const r = 2.5 - c * 0.42; const g = new THREE.ConeGeometry(r, 2.6, 8); g.translate(0, 1.6 + c * 1.45 + 1.3, 0); pineParts.push(g); }
    const pineGeo = mergeGeometries(pineParts);
    const leafParts = [];
    for (let c = 0; c < 5; c++) {
      const g = new THREE.IcosahedronGeometry(1.7 + hash(c, 7) * 0.7, 1);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) { const k = 1 + (vnoise(pos.getX(i) * 1.3 + c, pos.getY(i) * 1.3) - 0.5) * 0.4; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); }
      g.translate((hash(c, 1) - 0.5) * 2.6, 4.8 + hash(c, 2) * 2, (hash(c, 3) - 0.5) * 2.6);
      leafParts.push(g);
    }
    const leafGeo = mergeGeometries(leafParts.map((g) => g.toNonIndexed()));
    leafGeo.computeVertexNormals();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x173d1c, roughness: 0.9, flatShading: true });
    const autumn = this.def.time === 'autumn';
    const leafMat = new THREE.MeshStandardMaterial({ color: autumn ? 0xffffff : 0x2f5a1c, roughness: 0.9, flatShading: true });
    const fall = [0xc0301a, 0xd8641a, 0xe0a020, 0x9a2a14, 0x5a6a1c].map((c) => new THREE.Color(c));

    const spots = [];
    const b = this.bounds, minClear = mtn ? this.barrierOffset + 3 : this.barrierOffset + 12;
    const sample = [];
    for (let i = 0; i < this.count; i += 3) sample.push(this.points[i]);
    const start = this.points[0];
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let a = 0; a < 12000 && spots.length < target; a++) {
      const x = b.min.x - 260 + rnd() * (b.max.x - b.min.x + 520);
      const z = b.min.z - 260 + rnd() * (b.max.z - b.min.z + 520);
      if (mtn) {
        const info = this.roadInfo(x, z);
        if (info.d < minClear || rnd() > 0.35 + vnoise(x * 0.012 + 7, z * 0.012 + 3) * 0.9) continue;
        const y = this.terrainH(x, z);
        if (y - this.minY > 200) continue;
        spots.push({ x, y: y - 0.3, z, s: 0.8 + rnd() * 0.7, rot: rnd() * Math.PI * 2, pine: rnd() < (this.def.time === 'autumn' ? 0.35 : 0.75) });
        continue;
      }
      if ((x - start.x) ** 2 + (z - start.z) ** 2 < 140 * 140) continue;
      let near = Infinity;
      for (const p of sample) near = Math.min(near, (p.x - x) ** 2 + (p.z - z) ** 2);
      if (near < minClear * minClear) continue;
      if (rnd() > vnoise(x * 0.01 + 7, z * 0.01 + 3) * 1.4) continue;
      const d = Math.sqrt(near);
      const hills = fbm(x * 0.0035 + 17, z * 0.0035 + 3, 3) * 0.75 + vnoise(x * 0.011, z * 0.011) * 0.3;
      const y = sstep(70, 280, d) * (4 + hills * 34) + sstep(650, 1150, d) * (50 + hills * 170) - 0.3;
      spots.push({ x, y, z, s: 0.8 + rnd() * 0.7, rot: rnd() * Math.PI * 2, pine: rnd() < 0.6 });
    }
    const mk = (geo, mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach((t, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot); m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s)); im.setMatrixAt(i, m);
        if (autumn && mat === leafMat) im.setColorAt(i, fall[Math.floor(hash(t.x, t.z) * fall.length)]);
      });
      im.count = list.length;
      im.castShadow = this.quality !== 'low';
      this.group.add(im);
    };
    mk(trunkGeo, trunkMat, spots);
    mk(pineGeo, pineMat, spots.filter((t) => t.pine));
    mk(leafGeo, leafMat, spots.filter((t) => !t.pine));
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    this.scene.remove(this.group);
  }
}
