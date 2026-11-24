// 電腦對手：依賽道曲率規劃速度（含煞車距離）、沿賽道追線、閃避前車；難易度調整速度與失誤
import { CarPhysics } from './carPhysics.js';
import { buildCar } from './carModel.js';
import { PAINTS, getCar } from './data.js';

const G = 9.81;

export const DIFFICULTIES = {
  easy:   { name: '簡單', pace: 0.48, power: 0.72, grip: 0.92, wobble: 1.0, reward: 0.8, rubber: [-0.12, 0.02] },
  normal: { name: '普通', pace: 0.62, power: 0.88, grip: 0.97, wobble: 0.35, reward: 1.0, rubber: [-0.07, 0.03] },
  hard:   { name: '困難', pace: 0.86, power: 1.0, grip: 1.03, wobble: 0.05, reward: 1.4, rubber: [-0.03, 0.04] },
};
export const DIFF_KEYS = ['easy', 'normal', 'hard'];

export class Rival {
  /**
   * @param who  RIVALS 裡的角色 { name, car, paint }
   * @param base 玩家車輛規格：對手性能以玩家車為基準再乘上難度，確保任何車都有對等的對手
   */
  constructor(who, base, diffKey, track, quality, seed) {
    this.who = who;
    this.name = who.name;
    const vis = getCar(who.car);
    this.spec = vis;
    const d = this.diff = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
    const c = this.car = new CarPhysics(vis);
    c.assistLevel = 2;
    c.engineForce = base.engineForce * (vis.mass / base.mass) * d.power;
    c.maxSpeed = base.maxSpeed * Math.sqrt(d.power);
    c.grip = base.grip * d.grip;
    c.downforce = base.downforce;
    c.rearGripBias = Math.max(c.rearGripBias, 1.12);
    this.model = buildCar(vis, PAINTS[who.paint ?? vis.defaultPaint], { shadows: quality !== 'low' });
    this.track = track;
    this.seed = seed;
    this.lane = 0; this.laneBase = ((seed * 0.37) % 1 - 0.5) * 0.5;
    this.stuck = 0;
    this.road = { y: 0, gx: 0, gz: 0 };
    // 每個賽道點的過彎極限速度（以前後 ±3 點的最大曲率估算）
    const t = track, n = t.count;
    this.vCorner = new Float32Array(n);
    const mu = c.grip * G * d.pace;
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (let o = -3; o <= 3; o++) k = Math.max(k, Math.abs(t.curvature[t.wrap(i + o)]));
      this.vCorner[i] = Math.min(c.maxSpeed, Math.sqrt(mu / Math.max(k, 1e-5)));
    }
    this.decel = 10.5 * (0.75 + d.pace * 0.3);
  }

  place(idx, lateral) {
    const t = this.track, p = t.points[idx], tg = t.tangents[idx], r = t.rights[idx];
    this.car.reset(p.x + r.x * lateral, p.z + r.z * lateral, Math.atan2(tg.x, tg.z));
    this.progress = idx;
    this.lane = lateral;
    this.stuck = 0;
    this.applyRoad(idx);
    this.car.applyVisual(this.model);
  }
  applyRoad(i) {
    this.track.roadAt(this.car.x, this.car.z, i, this.road);
    this.car.y = this.road.y; this.car.gx = this.road.gx; this.car.gz = this.road.gz;
  }

  /** 每畫格決定方向盤 / 油門 / 煞車。others: 其他車 [{x,z,vx,vz,progress,lat}] */
  think(dt, others, time, rubber) {
    const c = this.car, t = this.track, n = t.count, d = this.diff;
    const i = this.progress, v = Math.max(0, c.forwardSpeed);
    const hw = t.halfWidth;
    const myLat = t.lateral(c.x, c.z, i);

    // 目標速度：往前看約 300 m，取「彎道極限 + 煞車距離」的最小值
    const look = Math.min(n - 1, Math.ceil(300 / t.spacing));
    let target = c.maxSpeed;
    for (let o = 2; o < look; o += 2) {
      const vc = this.vCorner[t.wrap(i + o)];
      const vReq = Math.sqrt(vc * vc + 2 * this.decel * o * t.spacing);
      if (vReq < target) target = vReq;
    }
    target *= rubber;

    // 閃避：前方近距離有車就換線，換不了就跟車
    let want = this.laneBase * hw;
    const limit = Math.max(0.5, hw - 1.4);
    for (const o of others) {
      let ahead = t.wrap(o.progress - i); if (ahead > n / 2) ahead -= n;
      const dist = ahead * t.spacing;
      if (dist < -4 || dist > 22) continue;
      const dl = o.lat - myLat;
      if (Math.abs(dl) > 2.6) continue;
      const side = dl > 0 ? -1 : 1;
      const cand = o.lat + side * 2.9;
      want = Math.abs(cand) <= limit ? cand : o.lat - side * 2.9;
      if (dist > 0 && dist < 9 && Math.abs(dl) < 2.0) {
        const ov = (o.vx * t.tangents[o.progress].x + o.vz * t.tangents[o.progress].z);
        target = Math.min(target, Math.max(ov - 1, 5));
      }
    }
    want = Math.max(-limit, Math.min(limit, want));
    this.lane += (want - this.lane) * Math.min(1, dt * 1.6);

    // 追線：看前方一段距離的點（速度越快看越遠）
    const ahead = Math.round((6 + v * 0.45) / t.spacing);
    const j = t.wrap(i + ahead), p = t.points[j], r = t.rights[j];
    const tx = p.x + r.x * this.lane, tz = p.z + r.z * this.lane;
    const wantH = Math.atan2(tx - c.x, tz - c.z);
    let diff = wantH - c.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    let steer = -diff * 2.6 + c.r * 0.08;
    steer += Math.sin(time * 1.7 + this.seed * 3.1) * 0.08 * d.wobble;
    this.steer = Math.max(-1, Math.min(1, steer));

    if (v < target - 0.5) { this.throttle = 1; this.brake = 0; }
    else if (v < target + 1.5) { this.throttle = 0.25; this.brake = 0; }
    else { this.throttle = 0; this.brake = Math.min(1, (v - target) / 5); }
    // 轉向很大時收油，避免推頭
    if (Math.abs(this.steer) > 0.85 && v > 20) this.throttle *= 0.5;

    // 卡住 / 衝出太遠：重置回賽道
    this.stuck = (v < 2 || Math.abs(myLat) > hw + 9) ? this.stuck + dt : 0;
  }
}
