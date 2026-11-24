// 賽道：Catmull-Rom 中心線、柏油路面、彎道路緣石、碎石緩衝區、W 型護欄、起伏地形、
// 維修區建築、看台、廣告看板、樹林與五燈起跑燈號。也提供最近點 / 側向距離查詢。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CONTROL = [
  [0, 0], [120, 0], [200, 10], [250, 60], [255, 130], [215, 190], [150, 205], [105, 170],
  [60, 120], [10, 140], [-40, 200], [-110, 215], [-170, 170], [-185, 95], [-150, 35], [-80, 5],
];
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
  constructor(scene, { quality = 'high' } = {}) {
    this.scene = scene;
    this.quality = quality;
    this.scale = 1.45;
    this.halfWidth = 7.5;
    this.curbWidth = 1.2;
    this.gravelWidth = 5;
    this.barrierOffset = 20;
    this.spacing = 2;
    this.checkpointCount = 10;
    this.checkpointZone = 15;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.obstacles = []; // 圓形障礙物（龍門架柱子）{x, z, r}

    this.generatePath();
    this.computeBarriers();
    this.buildTerrain();
    this.buildRoad();
    this.buildBarriers();
    this.buildStart();
    this.buildBuildings();
    this.buildTrees();
    this.checkpoints = [];
    for (let i = 0; i < this.checkpointCount; i++) this.checkpoints.push(Math.floor(i * this.count / this.checkpointCount));
    this.setStartLights(0);
  }

  get startIndex() { return this.wrap(-8); }
  wrap(i) { return ((i % this.count) + this.count) % this.count; }

  // ---------------- 路徑 ----------------
  generatePath() {
    const n = CONTROL.length, s = this.scale;
    const ctrl = CONTROL.map(([x, z]) => new THREE.Vector3(x * s, 0, z * s));
    const curve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5);
    const total = curve.getLength();
    this.totalLength = total;
    this.count = Math.max(32, Math.round(total / this.spacing));
    const pts = curve.getSpacedPoints(this.count).slice(0, this.count);
    this.points = pts;
    this.dist = pts.map((_, i) => i * total / this.count);
    this.tangents = []; this.rights = [];
    for (let i = 0; i < this.count; i++) {
      const t = new THREE.Vector3().subVectors(pts[this.wrap(i + 1)], pts[this.wrap(i - 1)]).normalize();
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
  edge(i, off) { const p = this.points[i], r = this.rights[i]; return new THREE.Vector3(p.x + r.x * off, 0, p.z + r.z * off); }
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
        for (const [d, y] of prof) { const e = this.edge(i, side * (offs[i] + d)); pos.push(e.x, y, e.z); }
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
    const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.6), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 }));
    line.rotation.set(-Math.PI / 2, 0, 0);
    line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), yaw);
    line.position.set(p.x, 0.04, p.z);
    line.receiveShadow = true;
    this.group.add(line);

    // 起跑格線
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.6 });
    const gridGeo = [];
    for (let g = 0; g < 6; g++) {
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
    this.group.add(new THREE.Mesh(mergeGeometries(gridGeo), white));

    // 龍門架 + 五顆起跑燈
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.75 });
    const px = hw + this.curbWidth + 3;
    const gantry = new THREE.Group();
    gantry.position.set(p.x, 0, p.z);
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

  // ---------------- 樹林 ----------------
  buildTrees() {
    const target = this.quality === 'low' ? 260 : 520;
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
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a1c, roughness: 0.9, flatShading: true });

    const spots = [];
    const b = this.bounds, minClear = this.barrierOffset + 12;
    const sample = [];
    for (let i = 0; i < this.count; i += 3) sample.push(this.points[i]);
    const start = this.points[0];
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let a = 0; a < 9000 && spots.length < target; a++) {
      const x = b.min.x - 260 + rnd() * (b.max.x - b.min.x + 520);
      const z = b.min.z - 260 + rnd() * (b.max.z - b.min.z + 520);
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
      list.forEach((t, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot); m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s)); im.setMatrixAt(i, m); });
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
