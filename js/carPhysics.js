// 賽車物理（俯視平面模型）：前後軸漸進式輪胎抓地、載重轉移、下壓力、四驅、手煞車、
// 以及依設定的操控輔助（類似 ESC 車身穩定）。座標：+Y 向上，車頭方向 f = (sin h, cos h)。
import { Settings } from './store.js';

const G = 9.81;
export const ASSIST_LEVELS = [0, 0.55, 1];
export const ASSIST_NAMES = ['關', '中', '高'];

export class CarPhysics {
  constructor(spec) {
    this.spec = spec;
    this.m = spec.mass;
    this.L = spec.frontAxleZ - spec.rearAxleZ;
    const comZ = (spec.frontAxleZ + spec.rearAxleZ) / 2 - 0.05;
    this.a = spec.frontAxleZ - comZ; // 重心到前軸
    this.b = comZ - spec.rearAxleZ;  // 重心到後軸
    this.comZ = comZ;
    this.I = this.m * 1.9;
    this.engineForce = spec.engineForce;
    this.maxSpeed = spec.maxSpeed;
    this.brakeForce = this.m * 14;
    this.reverseForce = this.m * 4;
    this.grip = spec.grip;
    this.downforce = spec.downforce;

    // 輪胎 / 轉向參數（沿用 Unity 版調校）
    this.frontPeak = 8; this.rearPeak = 7;
    this.rearGripBias = spec.rearGripBias ?? 1.12;
    this.driveFront = spec.driveFront ?? 0.5; // 0 = 後驅、0.5 = 四驅
    this.frontSlide = 0.85; this.rearSlide = 0.9;
    this.handbrakeRearGrip = 0.35;
    this.offTrackGripMul = 0.8; this.offTrackDrag = 60;
    this.frontBrakeBias = 0.6;
    this.maxSteerLow = 30; this.steerFalloff = 12;
    this.steerSpeed = 3.2; this.steerReturn = 6; this.steerCurve = 1.4;
    this.yawAssist = 3.5; this.slideAssist = 1.6;

    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x; this.z = z; this.h = heading;
    this.y = 0; this.gx = 0; this.gz = 0; // 路面高度與坡度（dy/dx, dy/dz）
    this.vx = 0; this.vz = 0; this.r = 0;
    this.steerInput = 0; this.steerAngle = 0;
    this.ax = 0; this.aLat = 0; this.aLong = 0;
    this.wheelSpin = 0;
    this.rpm = 0.2;
    this.offTrack = false;
  }

  get fx() { return Math.sin(this.h); }
  get fz() { return Math.cos(this.h); }
  get rx() { return -Math.cos(this.h); } // 畫面右方
  get rz() { return Math.sin(this.h); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get kmh() { return this.speed * 3.6; }
  get forwardSpeed() { return this.vx * this.fx + this.vz * this.fz; }
  get slipAngle() {
    const s = this.speed;
    if (s < 2) return 0;
    const fwd = this.forwardSpeed >= 0 ? 1 : -1;
    const c = (this.vx * this.fx + this.vz * this.fz) * fwd / s;
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }

  /** 每畫格（非固定步長）處理方向盤平滑 */
  updateSteer(dt, rawSteer) {
    const target = Math.sign(rawSteer) * Math.pow(Math.abs(rawSteer), this.steerCurve);
    const returning = Math.abs(target) < Math.abs(this.steerInput) || target * this.steerInput < 0;
    const rate = returning ? this.steerReturn : this.steerSpeed * (1 - 0.4 * Math.min(1, this.speed / 50));
    const d = target - this.steerInput;
    this.steerInput += Math.sign(d) * Math.min(Math.abs(d), dt * rate);
  }

  step(dt, inp) {
    const { throttle, brake, handbrake, enabled } = inp;
    const m = this.m, fx = this.fx, fz = this.fz, rx = this.rx, rz = this.rz;
    const fwd = this.forwardSpeed;
    const speed = this.speed;

    const maxSteer = this.maxSteerLow / (1 + Math.max(0, fwd) / this.steerFalloff);
    this.steerAngle = this.steerInput * maxSteer;
    const delta = this.steerAngle * Math.PI / 180;
    let assist = ASSIST_LEVELS[Math.max(0, Math.min(2, Settings.assist))];
    if (handbrake) assist *= 0.2;

    // 驅動 / 煞車
    let drive = 0, brakeAll = false;
    if (enabled && throttle > 0.05) {
      const curve = fwd >= 0 ? Math.max(0, 1 - Math.pow(fwd / this.maxSpeed, 2)) : 1;
      drive += throttle * this.engineForce * curve;
    }
    if (enabled && brake > 0.05) {
      if (fwd > 1) brakeAll = true;
      else if (throttle < 0.1 && fwd > -12) drive -= brake * this.reverseForce;
    }
    if (!enabled) brakeAll = true;
    const brakeAmt = enabled ? brake : 1;

    // 軸荷：靜態 + 下壓力 + 縱向載重轉移
    const df = this.downforce * speed * speed;
    const transfer = m * this.aLong * 0.45 / this.L;
    const Wf = Math.max(0.15 * m * G, m * G * this.b / this.L + df * 0.5 - transfer);
    const Wr = Math.max(0.15 * m * G, m * G * this.a / this.L + df * 0.5 + transfer);

    let Fx = 0, Fz = 0, tau = 0;
    for (let axle = 0; axle < 2; axle++) {
      const front = axle === 0;
      const W = front ? Wf : Wr;
      const mAxle = m * W / (Wf + Wr);
      const off = front ? this.a : -this.b;
      const dx = fx * off, dz = fz * off;
      const pvx = this.vx + this.r * dz, pvz = this.vz - this.r * dx;
      const c = front ? Math.cos(delta) : 1, s = front ? Math.sin(delta) : 0;
      const wfx = fx * c + rx * s, wfz = fz * c + rz * s;   // 輪胎前方
      const wrx = rx * c - fx * s, wrz = rz * c - fz * s;   // 輪胎右方
      const vLong = pvx * wfx + pvz * wfz;
      const vLat = pvx * wrx + pvz * wrz;

      let mu = this.grip * (this.offTrack ? this.offTrackGripMul : 1) * (front ? 1 : this.rearGripBias);
      if (!front && handbrake && enabled) mu *= this.handbrakeRearGrip;
      const maxF = mu * W;

      const slipDeg = Math.atan2(vLat, Math.max(Math.abs(vLong), 3)) * 180 / Math.PI;
      const norm = slipDeg / (front ? this.frontPeak : this.rearPeak);
      const an = Math.abs(norm);
      const curve = an <= 1 ? an * (1.5 - 0.5 * an * an) : 1 + ((front ? this.frontSlide : this.rearSlide) - 1) * Math.min(1, (an - 1) / 3);
      let lat = -Math.sign(norm) * curve * maxF;
      const latCancel = Math.abs(vLat) * mAxle / dt;
      lat = Math.max(-latCancel, Math.min(latCancel, lat));

      let lon = drive * (drive > 0 ? (front ? this.driveFront : 1 - this.driveFront) : 0.5);
      lon -= vLong * (this.offTrack ? this.offTrackDrag : 9) * 2;
      const hb = !front && handbrake && enabled;
      if (brakeAll || hb) {
        const amt = hb ? 1 : brakeAmt;
        const bias = front ? this.frontBrakeBias : 1 - this.frontBrakeBias;
        const maxBrake = Math.abs(vLong) * mAxle / dt;
        lon -= Math.sign(vLong) * Math.min(this.brakeForce * bias * amt, maxBrake);
      }
      lon = Math.max(-maxF * 1.2, Math.min(maxF * 1.2, lon));

      const Fwx = wfx * lon + wrx * lat, Fwz = wfz * lon + wrz * lat;
      Fx += Fwx; Fz += Fwz;
      tau += dz * Fwx - dx * Fwz;
    }

    // 空氣阻力
    Fx -= this.vx * speed * 0.6;
    Fz -= this.vz * speed * 0.6;
    // 坡道：重力沿坡面的分量
    Fx -= m * G * this.gx;
    Fz -= m * G * this.gz;

    const ax = Fx / m, az = Fz / m;
    this.vx += ax * dt;
    this.vz += az * dt;
    this.r += tau / this.I * dt;

    // 操控輔助（ESC）
    if (assist > 0 && speed > 2) {
      let desired = -fwd * Math.tan(delta) / this.L;
      const maxYaw = this.grip * G * 1.1 / Math.max(speed, 1);
      desired = Math.max(-maxYaw, Math.min(maxYaw, desired));
      this.r += (desired - this.r) * this.yawAssist * assist * dt;
      const slideT = Math.max(0, Math.min(1, (this.slipAngle - 6) / 20));
      if (slideT > 0) {
        const vSide = this.vx * rx + this.vz * rz;
        const k = this.slideAssist * assist * slideT * dt;
        this.vx -= rx * vSide * k;
        this.vz -= rz * vSide * k;
      }
    }
    this.r *= 1 - 0.8 * dt;

    // 靜止時不要滑動
    if (this.speed < 0.3 && (!enabled || throttle < 0.05)) { this.vx *= 0.9; this.vz *= 0.9; this.r *= 0.9; }

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.h += this.r * dt;

    // 加速度（用於視覺車身傾斜與載重轉移），平滑化
    const aLongNow = ax * fx + az * fz;
    const aLatNow = ax * rx + az * rz;
    this.aLong += (aLongNow - this.aLong) * Math.min(1, dt * 6);
    this.aLat += (aLatNow - this.aLat) * Math.min(1, dt * 6);

    this.wheelSpin += this.forwardSpeed / this.spec.wheelRadius * dt;

    // 模擬 6 速變速箱的轉速（給引擎聲）
    const sN = Math.min(1, Math.abs(this.forwardSpeed) / this.maxSpeed);
    const gp = sN * 5.5;
    let rpm = 0.25 + (gp - Math.floor(gp)) * 0.6 + sN * 0.15;
    if (Math.abs(this.forwardSpeed) < 2) rpm = 0.2 + (enabled ? throttle : 0) * 0.35;
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 8);
  }

  /** 牆面碰撞：n 指向可行駛區域，pen 為穿入深度；回傳撞擊速度變化量 */
  collide(nx, nz, pen, restitution = 0.25) {
    this.x += nx * pen;
    this.z += nz * pen;
    const vn = this.vx * nx + this.vz * nz;
    if (vn >= 0) return 0;
    const dv = -vn * (1 + restitution);
    this.vx += nx * dv;
    this.vz += nz * dv;
    // 摩擦：沿牆速度稍微損失，並減少自轉
    const tx = -nz, tz = nx;
    const vt = this.vx * tx + this.vz * tz;
    const loss = Math.min(Math.abs(vt), dv * 0.3) * Math.sign(vt);
    this.vx -= tx * loss; this.vz -= tz * loss;
    this.r *= 0.6;
    return dv;
  }

  /** 把物理狀態套用到車輛模型 */
  applyVisual(model, alpha = 1) {
    model.root.position.set(this.x, this.y, this.z);
    const gradeF = this.gx * this.fx + this.gz * this.fz;
    model.root.rotation.set(-Math.atan(gradeF), this.h, 0, 'YXZ');
    model.body.rotation.x = Math.max(-0.05, Math.min(0.05, -this.aLong * 0.0045));
    model.body.rotation.z = Math.max(-0.06, Math.min(0.06, -this.aLat * 0.005));
    const steerRad = -this.steerAngle * Math.PI / 180;
    for (let i = 0; i < 4; i++) {
      model.pivots[i].rotation.y = i < 2 ? steerRad : 0;
      model.spinners[i].rotation.x = this.wheelSpin;
    }
  }
}
