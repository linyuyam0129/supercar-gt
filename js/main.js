// 進入點：渲染器、畫面流程（車庫 ↔ 比賽）、設定選單、課金商店、對話框與控制器選單導覽
import * as THREE from 'three';
import { CARS, PAINTS, PAINT_NAMES, PRODUCTS, MISTAKES, TRACKS } from './data.js';
import { Profile, Settings, onChange, presetName, cyclePreset, buyProduct, SimulatedProvider } from './store.js';
import { Input, bindTouchButton, bindDragSteer, bindJoystick, bindLookDrag, enableTilt, stopRumble } from './input.js';
import { unlockAudio } from './audio.js';
import { ASSIST_NAMES } from './carPhysics.js';
import { Garage } from './garage.js';
import { Race, CAMERA_NAMES, formatTime, raiseAlert } from './race.js';
import { Hub } from './hub.js';
import { DIFFICULTIES, DIFF_KEYS } from './rivals.js';
import { INTRO, talkTo, speakerName, speakerColor, winStats } from './story.js';

const $ = (id) => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle('show', on);

// ---------------- 畫質 ----------------
function detectQuality() {
  if (Settings.quality !== 'auto') return Settings.quality;
  const mobile = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  return mobile ? (cores >= 8 ? 'medium' : 'low') : 'high';
}
let quality = detectQuality();

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);

function applyPixelRatio() {
  const cap = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1.1;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
}
function resize() {
  applyPixelRatio();
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const portrait = innerHeight > innerWidth && matchMedia('(pointer: coarse)').matches;
  show('rotate', portrait);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------------- 狀態 ----------------
let mode = null; // 'hub' | 'garage' | 'race'
let garage = null, race = null, hub = null;
const modalStack = []; // 開啟中的對話層（最上層在最後）
let navIndex = 0;

function setLoading(p, text) {
  $('loadBar').style.width = `${Math.round(p * 100)}%`;
  if (text) $('loadText').textContent = text;
}
// 讓載入畫面先畫出來；分頁在背景時 rAF 不會觸發，所以加上計時器保底
const nextFrame = () => new Promise((r) => { let done = false; const f = () => { if (!done) { done = true; setTimeout(r, 0); } }; requestAnimationFrame(f); setTimeout(f, 120); });

async function enterHub() {
  show('loading'); setLoading(0.2, '前往聯賽園區…');
  await nextFrame();
  disposeAll();
  hub = new Hub(renderer, camera, quality);
  mode = 'hub';
  setLoading(1);
  show('hud', false); show('finish', false); show('garage', false);
  show('hub');
  refreshHub();
  show('loading', false);
  if (!Profile.flag('intro')) {
    setTimeout(() => talk(INTRO, [{ label: '出發吧！', act: null }], () => {
      Profile.setFlag('intro');
      toast(Input.usingTouch ? '用左下拖曳走動，靠近發光圈按「互動」' : 'WASD 走動、Q/E 轉鏡頭，靠近發光圈按 Enter 互動', 4200);
    }), 600);
  }
}
function refreshHub() {
  if (!hub) return;
  $('hCoins').textContent = Profile.coins.toLocaleString();
  const st = winStats();
  $('hTrophy').textContent = `🏆 ${st.wins}/${st.total}`;
}

async function enterGarage() {
  show('loading'); setLoading(0.2, '準備車庫…');
  await nextFrame();
  disposeAll();
  garage = new Garage(renderer, camera, quality);
  mode = 'garage';
  setLoading(1);
  show('hud', false); show('finish', false); show('hub', false);
  show('garage');
  refreshGarage();
  show('loading', false);
}

async function enterRace() {
  unlockAudio();
  if (Settings.steerMode === 'tilt') await enableTilt();
  show('garage', false); show('hub', false);
  show('loading'); setLoading(0.15, `建造賽道與地形…（${TRACKS.find((t) => t.id === Settings.track)?.name || ''}）`);
  await nextFrame();
  disposeAll();
  setLoading(0.5, '整備賽車…');
  await nextFrame();
  race = new Race(renderer, camera, quality, { onFinish, toast: hudToast });
  mode = 'race';
  setLoading(1);
  show('hud');
  applyTouchMode();
  show('loading', false);
}

function disposeAll() {
  closeAllModals();
  if (garage) { garage.dispose(); garage = null; }
  if (hub) { hub.dispose(); hub = null; }
  if (race) { race.dispose(); race = null; }
  renderer.renderLists.dispose();
}

// ---------------- 車庫 UI ----------------
function stat(label, v, max, text) {
  return `<div class="stat"><span>${label}</span><div class="track"><i style="width:${Math.min(100, v / max * 100)}%"></i></div><b>${text}</b></div>`;
}
function refreshGarage() {
  if (!garage) return;
  const c = garage.car;
  $('gCoins').textContent = Profile.coins.toLocaleString();
  $('gVip').classList.toggle('hidden', !Profile.vip);
  $('gPage').textContent = `${garage.index + 1} / ${CARS.length}`;
  $('gName').textContent = c.name;
  $('gSub').textContent = c.subtitle;
  $('gDesc').textContent = c.description;
  $('gStats').innerHTML =
    stat('極速', c.topSpeedKmh - 150, 310, `${c.topSpeedKmh} km/h`) +
    stat('加速', 5 - c.zeroTo100, 3.3, `0-100 ${c.zeroTo100.toFixed(1)}s`) +
    stat('抓地力', c.grip - 1, 0.75, `${c.grip.toFixed(2)} G`) +
    stat('下壓力', c.downforce, 3.1, c.downforce.toFixed(1));
  const p = Profile.paintOf(c);
  $('gPaintName').textContent = `烤漆：${PAINT_NAMES[p]}`;
  $('gSwatches').innerHTML = PAINTS.map((col, i) =>
    `<button class="swatch nav${i === p ? ' on' : ''}" data-paint="${i}" style="background:rgb(${col.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(',')})" aria-label="${PAINT_NAMES[i]}"></button>`).join('');
  const owned = Profile.owns(c.id);
  const btn = $('gAction'), price = $('gPrice');
  if (owned) {
    price.className = 'price owned';
    price.textContent = Profile.selected === c.id ? '✓ 使用中' : '✓ 已擁有';
    btn.textContent = '開始比賽';
    btn.classList.remove('buy');
  } else {
    price.className = 'price';
    price.innerHTML = `<span class="coin"></span>${c.price.toLocaleString()}`;
    btn.textContent = Profile.coins >= c.price ? '購買此車' : '金幣不足 → 課金';
    btn.classList.add('buy');
  }
}
function changeCar(d) { garage.show(garage.index + d); refreshGarage(); }
function garageAction() {
  const c = garage.car;
  if (Profile.owns(c.id)) { Profile.select(c.id); openTracks(); return; }
  if (Profile.coins < c.price) { openShop(); toast(`還差 ${(c.price - Profile.coins).toLocaleString()} 金幣`); return; }
  confirmDialog(`以 <span class="coin"></span><b>${c.price.toLocaleString()}</b> 購買<br><b>${c.name}</b>？`, () => {
    if (Profile.tryBuy(c)) { toast(`已購買 ${c.name}！`); refreshGarage(); }
  });
}
$('gBack').onclick = () => enterHub();
$('gPrev').onclick = () => changeCar(-1);
$('gNext').onclick = () => changeCar(1);
$('gAction').onclick = garageAction;
$('gShopBtn').onclick = openShop;
$('gSetBtn').onclick = () => openMenu(false);
$('gFullBtn').onclick = toggleFullscreen;
$('gSwatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-paint]');
  if (!b) return;
  garage.setPaint(+b.dataset.paint);
  refreshGarage();
});
onChange(() => { if (mode === 'garage') refreshGarage(); if (mode === 'hub') refreshHub(); $('sCoins').textContent = Profile.coins.toLocaleString(); });

function toggleFullscreen() {
  const d = document.documentElement;
  if (!document.fullscreenElement) {
    (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d).then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } else document.exitFullscreen?.();
}

// ---------------- 商店 ----------------
function openShop() {
  $('sCoins').textContent = Profile.coins.toLocaleString();
  $('sList').innerHTML = PRODUCTS.map((p) => {
    const owned = p.vip && Profile.vip;
    return `<button class="item product nav${owned ? ' owned' : ''}" data-prod="${p.id}">
      <span class="lbl">${p.title}${p.badge ? `<span class="badge">${p.badge}</span>` : ''}<span class="pdesc">${p.desc}</span></span>
      <span class="val">${owned ? '已擁有' : p.price}</span></button>`;
  }).join('');
  openModal('shop');
}
$('sList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-prod]');
  if (!b) return;
  const p = PRODUCTS.find((x) => x.id === b.dataset.prod);
  if (p.vip && Profile.vip) { toast('已擁有 VIP 通行證'); return; }
  confirmDialog(`購買「${p.title}」<br>價格 <b>${p.price}</b><br><span class="warn">${SimulatedProvider.testMode ? '測試模式：不會實際扣款' : ''}</span>`, async () => {
    toast('處理中…', 1300);
    const r = await buyProduct(p);
    toast(r.ok ? `${p.coins ? `+${p.coins.toLocaleString()} 金幣　` : 'VIP 已啟用　'}${r.message}` : `購買失敗：${r.message}`, 2800);
    openShop();
    refreshGarage();
  });
});
$('sClose').onclick = () => closeModal('shop');

// ---------------- 選擇賽道 ----------------
const TIME_NAMES = { day: '白天', night: '夜間', autumn: '秋季午後', dusk: '黃昏', snow: '雪天', desert: '沙漠正午' };
const LAPS = [1, 2, 3, 5];
const OPPS = [0, 1, 3, 5];
const WIN_NAMES = ['尚未獲勝', '簡單 勝利', '普通 勝利', '困難 勝利'];
function refreshTrackOpts() {
  $('tLaps').textContent = `圈數：${Settings.laps} 圈`;
  $('tDiff').textContent = `難度：${(DIFFICULTIES[Settings.difficulty] || DIFFICULTIES.normal).name}`;
  $('tOpp').textContent = Settings.opponents ? `對手：${Settings.opponents} 人` : '對手：無（計時賽）';
  $('tDiff').disabled = !Settings.opponents;
}
function openTracks() {
  const c = Profile.selectedCar();
  $('tCar').textContent = `使用車輛：${c.name}`;
  refreshTrackOpts();
  $('tList').innerHTML = TRACKS.map((t) => {
    const best = Profile.bestLap(t.id);
    const stars = '★'.repeat(t.difficulty) + '☆'.repeat(3 - t.difficulty);
    return `<button class="item product nav${t.id === Settings.track ? ' sel' : ''}" data-track="${t.id}">
      <span class="lbl">${t.name}<span class="badge">${t.type === 'mountain' ? '山路' : '賽道'}</span><span class="badge alt">${TIME_NAMES[t.time]}</span>
        <span class="pdesc">${t.desc}</span>
        <span class="pdesc">難度 <b class="stars">${stars}</b>　金幣 ×${t.reward}　最佳單圈 ${formatTime(best)}　${Profile.winLevel(t.id) ? '🏆 ' : ''}${WIN_NAMES[Profile.winLevel(t.id)]}</span></span>
      <span class="val">出發</span></button>`;
  }).join('');
  openModal('tracks');
  navIndex = Math.max(0, TRACKS.findIndex((t) => t.id === Settings.track));
  updateNavFocus();
}
$('tList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-track]');
  if (!b) return;
  Settings.track = b.dataset.track;
  closeModal('tracks');
  enterRace();
});
$('tLaps').onclick = () => { Settings.laps = LAPS[(LAPS.indexOf(Settings.laps) + 1) % LAPS.length]; refreshTrackOpts(); };
$('tDiff').onclick = () => { Settings.difficulty = DIFF_KEYS[(DIFF_KEYS.indexOf(Settings.difficulty) + 1) % DIFF_KEYS.length]; refreshTrackOpts(); };
$('tOpp').onclick = () => { Settings.opponents = OPPS[(OPPS.indexOf(Settings.opponents) + 1) % OPPS.length]; refreshTrackOpts(); };
$('tClose').onclick = () => closeModal('tracks');

// ---------------- 劇情對話 ----------------
let talkQ = [], talkActs = [], talkCb = null, typeTimer = 0, typeFull = '', typing = false;
function talk(lines, actions = [], cb = null) {
  talkQ = [...lines]; talkActs = actions; talkCb = cb;
  openModal('talk');
  nextLine();
}
function nextLine() {
  const l = talkQ.shift();
  if (!l) return;
  $('tkWho').textContent = speakerName(l.who);
  $('tkWho').style.color = speakerColor(l.who);
  typeFull = l.text; typing = true;
  let i = 0;
  const el = $('tkText'); el.textContent = '';
  clearInterval(typeTimer);
  typeTimer = setInterval(() => { i += 2; el.textContent = typeFull.slice(0, i); if (i >= typeFull.length) { clearInterval(typeTimer); typing = false; } }, 28);
  const last = talkQ.length === 0;
  const acts = last ? (talkActs.length ? talkActs : [{ label: '關閉', act: null }]) : [{ label: '▶ 繼續', act: '__next' }];
  $('tkOpts').innerHTML = acts.map((a, k) => `<button class="nav${k === 0 ? ' primary' : ''}" data-act="${a.act ?? ''}">${a.label}</button>`).join('');
  navIndex = 0; updateNavFocus();
}
function finishTyping() { clearInterval(typeTimer); typing = false; $('tkText').textContent = typeFull; }
$('tkOpts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  e.stopPropagation();
  if (typing) { finishTyping(); return; }
  const act = b.dataset.act;
  if (act === '__next') { nextLine(); return; }
  closeModal('talk');
  const cb = talkCb; talkCb = null;
  if (cb) cb(act);
  doAction(act);
});
$('talk').addEventListener('click', (e) => {
  if (e.target.closest('[data-act]')) return;
  if (typing) finishTyping();
  else if (talkQ.length) nextLine();
});
function doAction(act) {
  if (act === 'garage') enterGarage();
  else if (act === 'tracks') openTracks();
  else if (act === 'shop') openShop();
}
/** 園區互動點 */
function hubInteract(spot) {
  if (!spot) return;
  if (spot.id === 'garage') { enterGarage(); return; }
  if (spot.id === 'shop') { openShop(); return; }
  const who = spot.npc || spot.id;
  const t = talkTo(who);
  talk(t.lines, t.actions);
}
$('hAct').onclick = () => hub && hubInteract(hub.near);
$('hShopBtn').onclick = openShop;
$('hSetBtn').onclick = () => openMenu(false);
$('hFullBtn').onclick = toggleFullscreen;
bindJoystick($('joyArea'), $('joyBase'), $('joyKnob'));
bindLookDrag(canvas);

// ---------------- 對話框 ----------------
let dialogYes = null;
function confirmDialog(html, onYes) {
  $('dText').innerHTML = html;
  dialogYes = onYes;
  openModal('dialog');
}
$('dYes').onclick = () => { const f = dialogYes; dialogYes = null; closeModal('dialog'); f && f(); };
$('dNo').onclick = () => { dialogYes = null; closeModal('dialog'); };

// ---------------- 設定 / 暫停選單 ----------------
const onOff = (v) => ({ text: v ? '開' : '關', cls: v ? 'on' : 'off' });
const STEER_MODES = [['buttons', '按鈕'], ['drag', '滑動'], ['tilt', '重力感應']];
const STRENGTHS = [[0.4, '弱'], [0.7, '中'], [1, '強']];
const VOLUMES = [[0.2], [0.4], [0.6], [0.8], [1]];
const QUALITIES =[['auto', '自動'], ['high', '高'], ['medium', '中'], ['low', '低']];
const cycle = (list, cur, d = 1) => { const i = list.findIndex((x) => x[0] === cur); return list[((i < 0 ? 0 : i) + d + list.length) % list.length][0]; };
const label = (list, cur) => (list.find((x) => x[0] === cur) || list[0])[1];

function menuRows(inRace) {
  const rows = [
    { l: '震動提醒', v: () => onOff(Settings.vibration), f: () => { Settings.vibration = !Settings.vibration; } },
    { l: '震動強度', v: () => ({ text: label(STRENGTHS, Settings.vibrationStrength) }), f: (d) => { Settings.vibrationStrength = cycle(STRENGTHS, Settings.vibrationStrength, d); } },
    { l: '語音提醒', v: () => onOff(Settings.voice), f: () => { Settings.voice = !Settings.voice; } },
    { l: '語音音量', v: () => ({ text: `${Math.round(Settings.voiceVolume * 100)}%` }), f: (d) => { Settings.voiceVolume = cycle(VOLUMES, Settings.voiceVolume, d); } },
    { l: '畫面提醒', v: () => onOff(Settings.visual), f: () => { Settings.visual = !Settings.visual; } },
    { l: '提醒預設', v: () => ({ text: presetName() }), f: () => { cyclePreset(); } },
    { l: '測試提醒', v: () => ({ text: '▶' }), f: () => { unlockAudio(); raiseAlert(['offtrack', 'collision', 'spin', 'wrongway', 'checkpoint'][testIdx++ % 5]); } },
    { l: '操控輔助', v: () => ({ text: ASSIST_NAMES[Settings.assist] }), f: (d) => { Settings.assist = (Settings.assist + d + 3) % 3; } },
    { l: '觸控轉向', v: () => ({ text: label(STEER_MODES, Settings.steerMode) }), f: async (d) => { Settings.steerMode = cycle(STEER_MODES, Settings.steerMode, d); if (Settings.steerMode === 'tilt' && !(await enableTilt())) toast('此裝置無法使用重力感應'); applyTouchMode(); } },
    { l: '重力感應反向', v: () => onOff(Settings.tiltInvert), f: () => { Settings.tiltInvert = !Settings.tiltInvert; } },
    { l: '自動油門', v: () => onOff(Settings.autoThrottle), f: () => { Settings.autoThrottle = !Settings.autoThrottle; applyTouchMode(); } },
    { l: '鏡頭視角', v: () => ({ text: CAMERA_NAMES[Settings.camera] }), f: (d) => { Settings.camera = (Settings.camera + d + 3) % 3; } },
  ];
  if (!inRace) {
    rows.push({ l: '圈數', v: () => ({ text: `${Settings.laps} 圈` }), f: (d) => { const L = [1, 2, 3, 5]; Settings.laps = L[(L.indexOf(Settings.laps) + d + L.length) % L.length]; } });
    rows.push({ l: '畫質（重新載入後生效）', v: () => ({ text: label(QUALITIES, Settings.quality) }), f: (d) => { Settings.quality = cycle(QUALITIES, Settings.quality, d); } });
    rows.push({ l: '重設遊戲進度', danger: true, v: () => ({ text: '' }), f: () => confirmDialog('確定要清除金幣、車輛、戰績與設定？', () => { Profile.reset(); closeAllModals(); enterHub(); toast('已重設'); }) });
    rows.push({ l: '關閉', v: () => ({ text: '' }), f: () => closeModal('menu') });
  } else {
    rows.push({ l: '繼續比賽', v: () => ({ text: '' }), f: () => closeModal('menu') });
    rows.push({ l: '重新開始', v: () => ({ text: '' }), f: () => { closeModal('menu'); race.restart(); } });
    rows.push({ l: '返回園區', v: () => ({ text: '' }), f: () => { closeModal('menu'); enterHub(); } });
  }
  return rows;
}
let testIdx = 0, currentRows = [], menuInRace = false;
function renderMenu() {
  $('mList').innerHTML = currentRows.map((r, i) => {
    const v = r.v();
    return `<button class="item nav${r.danger ? ' danger' : ''}" data-row="${i}"><span class="lbl">${r.l}</span><span class="val ${v.cls || ''}">${v.text}</span></button>`;
  }).join('');
  updateNavFocus();
}
function openMenu(inRace) {
  menuInRace = inRace;
  currentRows = menuRows(inRace);
  $('mTitle').textContent = inRace ? '暫停' : '設定';
  openModal('menu');
  renderMenu();
}
$('mList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-row]');
  if (!b) return;
  navIndex = +b.dataset.row;
  await currentRows[+b.dataset.row].f(1);
  if ($('menu').classList.contains('show')) renderMenu();
  updateChips();
});

// ---------------- 對話層管理 + 控制器導覽 ----------------
function openModal(id) {
  if (!modalStack.includes(id)) modalStack.push(id);
  show(id);
  navIndex = 0;
  updateNavFocus();
}
function closeModal(id) {
  const i = modalStack.indexOf(id);
  if (i >= 0) modalStack.splice(i, 1);
  show(id, false);
  navIndex = 0;
  updateNavFocus();
}
function closeAllModals() { [...modalStack].forEach(closeModal); }
function navItems() {
  const top = modalStack[modalStack.length - 1];
  const root = top ? $(top) : mode === 'garage' ? $('garage') : mode === 'hub' ? $('hub') : mode === 'race' && race?.state === 'finished' ? $('finish') : null;
  if (!root) return [];
  return [...root.querySelectorAll('.nav')].filter((e) => e.offsetParent !== null);
}
function updateNavFocus() {
  document.querySelectorAll('.nav.focus').forEach((e) => e.classList.remove('focus'));
  if (!Input.usingGamepad) return;
  const items = navItems();
  if (!items.length) return;
  navIndex = Math.max(0, Math.min(items.length - 1, navIndex));
  items[navIndex].classList.add('focus');
  items[navIndex].scrollIntoView?.({ block: 'nearest' });
}

function handleMenuInput() {
  const top = modalStack[modalStack.length - 1];
  if (!top) return false;
  const items = navItems();
  if (Input.up) navIndex--;
  if (Input.down) navIndex++;
  if (Input.up || Input.down) { navIndex = (navIndex + items.length) % Math.max(1, items.length); updateNavFocus(); }
  if (top === 'menu' && (Input.left || Input.right)) {
    const r = currentRows[navIndex];
    if (r) { Promise.resolve(r.f(Input.left ? -1 : 1)).then(() => { renderMenu(); updateChips(); }); }
  }
  if (Input.confirm && items[navIndex]) items[navIndex].click();
  if (Input.back || (top === 'menu' && Input.pause)) {
    if (top === 'dialog') $('dNo').click(); else if (top !== 'talk') closeModal(top);
  }
  return true;
}

function handleGarageInput() {
  if (Input.lb || Input.left) changeCar(-1);
  if (Input.rb || Input.right) changeCar(1);
  if (Input.up || Input.down) {
    const p = (Profile.paintOf(garage.car) + (Input.up ? -1 : 1) + PAINTS.length) % PAINTS.length;
    garage.setPaint(p); refreshGarage();
  }
  if (Input.confirm) garageAction();
  if (Input.north) openShop();
  if (Input.pause) openMenu(false);
  if (Input.back) enterHub();
}

function handleHubInput() {
  if (Input.interact && hub.near) hubInteract(hub.near);
  if (Input.north) openShop();
  if (Input.pause) openMenu(false);
}
const NEAR_TEXT = (s) => s.prompt;
function updateHubHud() {
  const near = hub.near;
  const b = $('hAct');
  b.classList.toggle('show', !!near);
  if (near) b.textContent = (Input.usingGamepad ? 'Ⓐ ' : '') + NEAR_TEXT(near);
  $('hubHint').textContent = Input.usingGamepad
    ? '左搖桿 移動　右搖桿 鏡頭　A 互動　Y 商店　Start 設定'
    : `WASD 移動　Q / E 轉鏡頭　Enter / F 互動${near ? `（${near.prompt}）` : ''}　Esc 設定`;
}

function handleRaceInput() {
  if (Input.pause) { openMenu(true); return; }
  if (Input.toggleVib) { Settings.vibration = !Settings.vibration; hudToast(`震動提醒：${Settings.vibration ? '開' : '關'}`); }
  if (Input.toggleVoice) { Settings.voice = !Settings.voice; hudToast(`語音提醒：${Settings.voice ? '開' : '關'}`); }
  if (Input.toggleVisual) { Settings.visual = !Settings.visual; hudToast(`畫面提醒：${Settings.visual ? '開' : '關'}`); }
  if (Input.preset) hudToast(`提醒預設：${cyclePreset()}`);
  if (race.state === 'finished') {
    if (Input.confirm) $('fAgain').click();
    else if (Input.north || Input.back) $('fGarage').click();
  }
}

// ---------------- HUD ----------------
function onFinish(html) {
  $('fBody').innerHTML = html;
  setTimeout(() => { if (race && race.state === 'finished') { show('finish'); updateNavFocus(); } }, 900);
}
$('fAgain').onclick = () => { show('finish', false); race.restart(); };
$('fGarage').onclick = () => { show('finish', false); enterHub(); };
$('hPause').onclick = () => openMenu(true);
$('hCam').onclick = () => { Settings.camera = (Settings.camera + 1) % 3; hudToast('視角：' + CAMERA_NAMES[Settings.camera]); };
$('hReset').onclick = () => race && race.resetCar();
$('cVib').onclick = () => { Settings.vibration = !Settings.vibration; updateChips(); };
$('cVoice').onclick = () => { Settings.voice = !Settings.voice; unlockAudio(); updateChips(); };
$('cVis').onclick = () => { Settings.visual = !Settings.visual; updateChips(); };
function updateChips() {
  $('cVib').classList.toggle('on', !!Settings.vibration);
  $('cVoice').classList.toggle('on', !!Settings.voice);
  $('cVis').classList.toggle('on', !!Settings.visual);
}
onChange(updateChips);
updateChips();

let toastT = 0, gToastT = 0;
function hudToast(text, ms = 1600) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function toast(text, ms = 2000) {
  const t = $('gToast'); t.textContent = text; t.classList.add('show');
  clearTimeout(gToastT); gToastT = setTimeout(() => t.classList.remove('show'), ms);
}

function applyTouchMode() {
  const touch = $('touch');
  touch.classList.remove('mode-buttons', 'mode-drag', 'mode-tilt');
  touch.classList.add('mode-' + Settings.steerMode);
  document.body.classList.toggle('autothrottle', !!Settings.autoThrottle);
}
bindTouchButton($('tLeft'), 'left');
bindTouchButton($('tRight'), 'right');
bindTouchButton($('tGas'), 'gas');
bindTouchButton($('tBrake'), 'brake');
bindTouchButton($('tHand'), 'hand');
bindDragSteer($('dragArea'), $('dragKnob'));

const lightEls = [...document.querySelectorAll('#lights i')];
function updateHud() {
  const r = race;
  $('hPos').innerHTML = r.rivals.length ? `${r.position}<small>/ ${r.rivals.length + 1} 名</small>` : '';
  $('hLap').textContent = `圈數 ${Math.min(r.lap, r.totalLaps)}/${r.totalLaps}`;
  $('hTime').textContent = formatTime(r.state === 'racing' ? r.lapTime : r.state === 'countdown' ? 0 : r.raceTime + r.penalty);
  $('hBest').textContent = `最佳 ${formatTime(r.bestLap)}`;
  $('hPen').textContent = r.penalty > 0 ? `罰時 +${r.penalty.toFixed(1)}s` : '';
  $('hMis').textContent = r.state === 'countdown' ? '' : `失誤 ${r.detector.total}`;
  const kmh = Math.round(r.car.kmh);
  $('hSpeed').textContent = kmh;
  $('hSpeedBar').style.width = `${Math.min(100, kmh / r.spec.topSpeedKmh * 100)}%`;
  const showLights = r.state === 'countdown' || (r.state === 'racing' && r.raceTime < 0.8);
  $('lights').classList.toggle('show', showLights);
  lightEls.forEach((e, i) => e.classList.toggle('on', r.state === 'countdown' && i < r.lightsOn));
  const cd = $('countdown');
  if (r.state === 'countdown') { cd.textContent = r.lightsOn === 0 ? '準備' : ''; cd.style.color = '#fff'; cd.style.opacity = 1; }
  else if (r.state === 'racing' && r.raceTime < 1) { cd.textContent = 'GO!'; cd.style.color = '#4dff7a'; cd.style.opacity = 1 - r.raceTime; }
  else cd.textContent = '';
  $('hHint').textContent = Input.usingGamepad
    ? 'RT 油門　LT 煞車　左搖桿 轉向　A 手煞車　Y 重置　RB 視角　十字鍵 ←震動 ↑語音 →畫面　Start 暫停'
    : 'W 油門　S 煞車　A D 轉向　Space 手煞車　R 重置　C 視角　1/2/3 提醒開關　Tab 預設　Esc 暫停';
}

// ---------------- 主迴圈 ----------------
let last = performance.now();
let wasPad = null;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  Input.update();
  if (wasPad !== Input.usingGamepad) {
    wasPad = Input.usingGamepad;
    document.body.classList.toggle('pad', Input.usingGamepad);
    updateNavFocus();
  }
  document.body.classList.toggle('touch', Input.usingTouch && !Input.usingGamepad);

  const menuOpen = modalStack.length > 0;
  if (menuOpen) handleMenuInput();
  else if (mode === 'hub' && hub) handleHubInput();
  else if (mode === 'garage') handleGarageInput();
  else if (mode === 'race' && race) handleRaceInput();

  if (mode === 'hub' && hub) {
    const still = menuOpen || !document.body.contains(canvas);
    hub.update(dt, still ? { x: 0, y: 0 } : { x: Input.moveX, y: Input.moveY }, still ? 0 : Input.lookX);
    updateHubHud();
  } else if (mode === 'garage' && garage) {
    const pad = Input.pad();
    const lookX = pad ? (Math.abs(pad.axes[2] || 0) > 0.15 ? pad.axes[2] : 0) : 0;
    garage.update(dt, lookX);
  } else if (mode === 'race' && race) {
    race.update(dt, modalStack.length > 0);
    updateHud();
  }
}

// 一些瀏覽器只有在使用者觸控後才允許音效 / 震動
addEventListener('pointerdown', () => unlockAudio(), { once: true });
addEventListener('keydown', () => unlockAudio(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopRumble(); if (mode === 'race' && race && !modalStack.length) openMenu(true); } });

window.addEventListener('gamepadconnected', (e) => toast(`控制器已連線：${e.gamepad.id.replace(/\(.*?\)/g, '').trim()}`));
window.addEventListener('gamepaddisconnected', () => { toast('控制器已中斷連線'); if (mode === 'race' && race && !modalStack.length) openMenu(true); });

// 除錯用：在瀏覽器主控台可用 __game 存取目前狀態
window.__game = { get garage() { return garage; }, get race() { return race; }, get hub() { return hub; }, enterGarage, enterHub, camera, renderer };

enterHub().then(() => requestAnimationFrame(loop));
