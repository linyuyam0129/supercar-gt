// 音效：WebAudio 合成引擎聲、提示音、撞擊聲；語音提醒用瀏覽器內建語音合成（中文）
import { Settings } from './store.js';

let ctx = null, master = null;
let engine = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  // iOS：在使用者手勢中先唸一次空字串，之後語音才能正常播放
  if (window.speechSynthesis && !unlockAudio.spoken) {
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* */ }
    unlockAudio.spoken = true;
  }
}

export function startEngine(pitch = 1) {
  if (!ctx) return;
  stopEngine();
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
  const o2 = ctx.createOscillator(); o2.type = 'square';
  const o3 = ctx.createOscillator(); o3.type = 'sine';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = 0;
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  o1.connect(f); o2.connect(g2); g2.connect(f); o3.connect(g);
  f.connect(g); g.connect(master);
  o1.start(); o2.start(); o3.start();
  engine = { o1, o2, o3, f, g, pitch };
}

export function updateEngine(rpm, throttle, paused) {
  if (!engine) return;
  const t = ctx.currentTime;
  const base = (38 + rpm * 150) * engine.pitch;
  engine.o1.frequency.setTargetAtTime(base, t, 0.03);
  engine.o2.frequency.setTargetAtTime(base * 0.5, t, 0.03);
  engine.o3.frequency.setTargetAtTime(base * 0.25, t, 0.03);
  engine.f.frequency.setTargetAtTime(500 + rpm * 2200 + throttle * 800, t, 0.05);
  engine.g.gain.setTargetAtTime(paused ? 0 : 0.05 + throttle * 0.05, t, 0.05);
}

export function stopEngine() {
  if (!engine) return;
  const e = engine; engine = null;
  try { e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => { e.o1.stop(); e.o2.stop(); e.o3.stop(); }, 300); } catch { /* */ }
}

export function beep(freq = 660, dur = 0.18, vol = 0.35) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export function impact(strength = 1) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  const g = ctx.createGain(); g.gain.value = Math.min(1, 0.25 + strength * 0.5);
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

let speakingPriority = -1, speakingUntil = 0;
let zhVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /zh[-_]HK/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  return zhVoice;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export function speak(text, priority = 0, fallbackFreq = 600) {
  const now = performance.now();
  if (now < speakingUntil && priority < speakingPriority) return; // 低優先度不打斷高優先度
  speakingPriority = priority;
  speakingUntil = now + 1800;
  if (window.speechSynthesis) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = zhVoice ? zhVoice.lang : 'zh-TW';
      if (zhVoice) u.voice = zhVoice;
      u.rate = 1.15;
      u.volume = Settings.voiceVolume;
      speechSynthesis.speak(u);
      return;
    } catch { /* 改用提示音 */ }
  }
  beep(fallbackFreq, 0.35, 0.4 * Settings.voiceVolume);
}
