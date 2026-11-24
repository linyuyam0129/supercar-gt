// 玩家資料、提醒設定與（測試模式）商店，存在瀏覽器 localStorage
import { CARS, getCar } from './data.js';

const KEY = 'rg_mobile_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 私密模式等情況忽略 */ }
  listeners.forEach((f) => f());
}
const listeners = new Set();
export const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

function def(k, v) { if (state[k] === undefined) state[k] = v; }
function ensure() {
  def('coins', 3000);
  def('vip', false);
  def('owned', ['aurora']);
  def('selected', 'aurora');
  def('paints', {});
  def('settings', {});
  def('best', {});
  const s = state.settings;
  const d = { vibration: true, vibrationStrength: 1, voice: true, voiceVolume: 1, visual: true,
    assist: 2, steerMode: 'buttons', autoThrottle: false, camera: 0, quality: 'auto', laps: 3, track: 'circuit' };
  for (const k in d) if (s[k] === undefined) s[k] = d[k];
}
ensure();

export const Profile = {
  get coins() { return state.coins; },
  get vip() { return state.vip; },
  get selected() { return state.selected; },
  owns(id) { return state.vip || state.owned.includes(id); },
  paintOf(car) { const p = state.paints[car.id]; return p === undefined ? car.defaultPaint : p; },
  setPaint(car, i) { state.paints[car.id] = i; save(); },
  select(id) { if (this.owns(id)) { state.selected = id; save(); } },
  addCoins(n) { state.coins += n; save(); },
  tryBuy(car) {
    if (this.owns(car.id)) return true;
    if (state.coins < car.price) return false;
    state.coins -= car.price;
    state.owned.push(car.id);
    state.selected = car.id;
    save();
    return true;
  },
  grantVip() { state.vip = true; save(); },
  reset() { state = {}; ensure(); save(); },
  selectedCar() { return getCar(state.selected); },
  bestLap(trackId) { const b = state.best[trackId]; return b === undefined ? -1 : b; },
  /** 回傳是否刷新紀錄 */
  recordLap(trackId, t) { const b = this.bestLap(trackId); if (b < 0 || t < b) { state.best[trackId] = t; save(); return true; } return false; },
  ownedCount() { return CARS.filter((c) => this.owns(c.id)).length; },
};

export const Settings = new Proxy({}, {
  get: (_, k) => state.settings[k],
  set: (_, k, v) => { state.settings[k] = v; save(); return true; },
});

export const PRESETS = [
  { name: '全部開啟', v: [true, true, true] },
  { name: '僅震動', v: [true, false, false] },
  { name: '僅語音', v: [false, true, false] },
  { name: '僅畫面', v: [false, false, true] },
  { name: '全部關閉', v: [false, false, false] },
];
export function presetName() {
  const cur = [Settings.vibration, Settings.voice, Settings.visual];
  const p = PRESETS.find((x) => x.v.every((b, i) => b === cur[i]));
  return p ? p.name : '自訂';
}
export function cyclePreset() {
  const cur = [Settings.vibration, Settings.voice, Settings.visual];
  let i = PRESETS.findIndex((x) => x.v.every((b, j) => b === cur[j]));
  const p = PRESETS[(i + 1) % PRESETS.length];
  [Settings.vibration, Settings.voice, Settings.visual] = p.v;
  return p.name;
}

/**
 * 商店付款介面。目前使用「模擬付款」：只在本機加金幣、不會扣款。
 * 正式上架時，把 provider 換成真正的金流（例如 Google Play Billing / Apple IAP / Stripe），
 * 並在伺服器端驗證收據後才發放商品。
 */
export const SimulatedProvider = {
  testMode: true,
  purchase(product) {
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: '測試交易完成（未實際扣款）' }), 1200));
  },
};

export async function buyProduct(product, provider = SimulatedProvider) {
  const r = await provider.purchase(product);
  if (r.ok) {
    if (product.coins) Profile.addCoins(product.coins);
    if (product.vip) Profile.grantVip();
  }
  return r;
}
