// 統一輸入：觸控按鈕 / 滑動 / 重力感應、鍵盤、Xbox 控制器（Gamepad API）
import { Settings } from './store.js';

const keys = new Set();
const pressedKeys = new Set();
addEventListener('keydown', (e) => {
  if (!keys.has(e.code)) pressedKeys.add(e.code);
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const touch = { left: false, right: false, gas: false, brake: false, hand: false, dragSteer: 0 };
let tilt = 0;
let tiltEnabled = false;

const prevPad = [];
let padPressed = new Set();

export const Input = {
  steer: 0, throttle: 0, brake: 0, handbrake: false,
  usingGamepad: false, usingTouch: matchMedia('(pointer: coarse)').matches,
  padName: '',
  // 單次觸發
  reset: false, camera: false, pause: false, preset: false,
  toggleVib: false, toggleVoice: false, toggleVisual: false,
  up: false, down: false, left: false, right: false, confirm: false, back: false,
  north: false, lb: false, rb: false,

  update() {
    const pad = getPad();
    padPressed = new Set();
    if (pad) {
      pad.buttons.forEach((b, i) => { if (b.pressed && !prevPad[i]) padPressed.add(i); prevPad[i] = b.pressed; });
      if (padPressed.size || Math.abs(pad.axes[0]) > 0.3) { this.usingGamepad = true; this.usingTouch = false; }
      this.padName = pad.id.replace(/\(.*?\)/g, '').trim() || '控制器';
    } else this.padName = '';
    if (pressedKeys.size) { this.usingGamepad = false; }

    const k = (...c) => c.some((x) => keys.has(x));
    const kp = (...c) => c.some((x) => pressedKeys.has(x));
    const pp = (...i) => i.some((x) => padPressed.has(x));

    // 方向
    let steer = 0;
    if (k('KeyA', 'ArrowLeft')) steer -= 1;
    if (k('KeyD', 'ArrowRight')) steer += 1;
    if (touch.left) steer -= 1;
    if (touch.right) steer += 1;
    if (Settings.steerMode === 'drag') steer += touch.dragSteer;
    if (Settings.steerMode === 'tilt' && tiltEnabled) steer += tilt;
    let thr = k('KeyW', 'ArrowUp') || touch.gas ? 1 : 0;
    let brk = k('KeyS', 'ArrowDown') || touch.brake ? 1 : 0;
    let hand = k('Space') || touch.hand;
    if (pad) {
      const ax = pad.axes[0] || 0;
      const dz = 0.12;
      if (Math.abs(ax) > dz) steer += Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz);
      thr = Math.max(thr, btn(pad, 7));
      brk = Math.max(brk, btn(pad, 6));
      hand = hand || btn(pad, 0) > 0.5;
    }
    this.steer = Math.max(-1, Math.min(1, steer));
    this.throttle = thr;
    this.brake = brk;
    this.handbrake = hand;

    this.reset = kp('KeyR') || pp(3);
    this.north = kp('KeyT', 'KeyY') || pp(3);
    this.camera = kp('KeyC') || pp(5);
    this.lb = kp('KeyQ') || pp(4);
    this.rb = kp('KeyE') || pp(5);
    this.pause = kp('Escape') || pp(9);
    this.preset = kp('Tab') || pp(8);
    this.toggleVib = kp('Digit1') || pp(14);
    this.toggleVoice = kp('Digit2') || pp(12);
    this.toggleVisual = kp('Digit3') || pp(15);
    this.up = kp('ArrowUp', 'KeyW') || pp(12);
    this.down = kp('ArrowDown', 'KeyS') || pp(13);
    this.left = kp('ArrowLeft', 'KeyA') || pp(14);
    this.right = kp('ArrowRight', 'KeyD') || pp(15);
    this.confirm = kp('Enter', 'Space') || pp(0);
    this.back = kp('Escape', 'Backspace') || pp(1);
    pressedKeys.clear();
  },

  pad: () => getPad(),
  touch,
};

function btn(pad, i) { const b = pad.buttons[i]; return b ? (b.value || (b.pressed ? 1 : 0)) : 0; }
function getPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

// ---------- 觸控元件綁定 ----------
export function bindTouchButton(el, field) {
  const on = (e) => { e.preventDefault(); touch[field] = true; el.classList.add('down'); Input.usingTouch = true; Input.usingGamepad = false; };
  const off = (e) => { e.preventDefault(); touch[field] = false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function bindDragSteer(area, knob) {
  let id = null, startX = 0;
  const range = 90;
  area.addEventListener('pointerdown', (e) => {
    if (Settings.steerMode !== 'drag') return;
    id = e.pointerId; startX = e.clientX; area.setPointerCapture(id);
    knob.style.left = `${e.clientX - area.getBoundingClientRect().left}px`;
    knob.classList.add('show');
  });
  area.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const d = Math.max(-range, Math.min(range, e.clientX - startX));
    touch.dragSteer = d / range;
    knob.style.transform = `translateX(${d}px)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null; touch.dragSteer = 0; knob.style.transform = ''; knob.classList.remove('show');
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);
}

/** 重力感應：iOS 需要在使用者點擊時請求權限 */
export async function enableTilt() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') return false;
    }
  } catch { return false; }
  if (!tiltEnabled) {
    addEventListener('deviceorientation', (e) => {
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let v;
      if (angle === 90) v = e.beta;
      else if (angle === -90 || angle === 270) v = -e.beta;
      else v = e.gamma; // 直式時用左右傾斜
      if (v == null) return;
      const inv = Settings.tiltInvert ? -1 : 1;
      tilt = Math.max(-1, Math.min(1, (v / 24) * inv));
    });
  }
  tiltEnabled = true;
  return true;
}

// ---------- 震動 ----------
/** steps: [low, high, ms, gapMs] */
export function rumble(steps, strength = 1) {
  const pad = getPad();
  const act = pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators[0]));
  if (act && act.playEffect) {
    let t = 0;
    for (const [lo, hi, ms, gap] of steps) {
      setTimeout(() => act.playEffect('dual-rumble', { duration: ms, strongMagnitude: lo * strength, weakMagnitude: hi * strength }).catch(() => {}), t);
      t += ms + (gap || 0);
    }
  }
  if (navigator.vibrate && !Input.usingGamepad) {
    const pattern = [];
    for (const [lo, hi, ms, gap] of steps) { pattern.push(Math.round(ms * Math.min(1, strength + 0.2)), gap || 0); }
    try { navigator.vibrate(pattern); } catch { /* 部分瀏覽器（如 iOS Safari）不支援 */ }
  }
}
export function stopRumble() {
  const pad = getPad();
  if (pad && pad.vibrationActuator && pad.vibrationActuator.reset) pad.vibrationActuator.reset().catch(() => {});
  if (navigator.vibrate) try { navigator.vibrate(0); } catch { /* */ }
}
