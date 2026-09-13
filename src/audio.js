// ============================================================
// 음성 / 효과음
//  음성 재생 우선순위 (PRD 4.2 — 최종본은 성우 녹음):
//    ① 부모가 앱에서 직접 녹음한 소리 (IndexedDB)
//    ② assets/audio/<key>.mp3 · .wav · .webm 파일
//    ③ 브라우저 TTS (녹음도 파일도 없을 때의 임시 대체)
//  효과음은 WebAudio로 합성 → 에셋 0개로도 완전 오프라인 동작
// ============================================================
import { state } from './store.js';
import { lineFor } from './lines.js';
import { recordedUrl } from './voicebank.js';

const AUDIO_DIR = 'assets/audio/';
const EXTS = ['mp3', 'wav', 'webm', 'm4a'];
const fileCache = new Map();   // key -> HTMLAudioElement | null(파일 없음)
const recCache = new Map();    // key -> HTMLAudioElement (녹음 재생용)
let ctx = null;
let koVoice = null;
let current = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if ('speechSynthesis' in window && !koVoice) pickVoice();
}

function pickVoice() {
  const pick = () => {
    const vs = speechSynthesis.getVoices();
    koVoice = vs.find((v) => /ko(-|_)?KR/i.test(v.lang)) || vs.find((v) => /^ko/i.test(v.lang)) || null;
  };
  pick();
  if (!koVoice) speechSynthesis.addEventListener('voiceschanged', pick, { once: true });
}

const vol = () => state.settings.volume ?? 0.85;

function play(el) {
  el.volume = vol();
  el.currentTime = 0;
  current = el;
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
}

/** assets/audio 에서 확장자를 차례로 찾아본다. 다 없으면 onFail() */
function playFile(key, onFail) {
  const cached = fileCache.get(key);
  if (cached === null) { onFail(); return; }
  if (cached) { play(cached); return; }

  let i = 0;
  const tryNext = () => {
    if (i >= EXTS.length) { fileCache.set(key, null); onFail(); return; }
    const el = new Audio(`${AUDIO_DIR}${key}.${EXTS[i++]}`);
    el.preload = 'auto';
    el.addEventListener('canplay', () => { fileCache.set(key, el); play(el); }, { once: true });
    el.addEventListener('error', tryNext, { once: true });
    el.load();
  };
  tryNext();
}

/**
 * 음성 재생. key = 음성 키(예: 'jamo-g', 'great', 'sticker-01')
 * text 를 넘기지 않으면 lines.js 에서 문구를 찾아 TTS로 읽는다.
 */
export function say(key, text) {
  stopVoice();
  if (vol() <= 0) return;
  const words = text ?? lineFor(key);

  // ① 직접 녹음한 소리
  const rec = key ? recordedUrl(key) : null;
  if (rec) {
    let el = recCache.get(key);
    if (!el || el.src !== rec) { el = new Audio(rec); recCache.set(key, el); }
    play(el);
    return;
  }
  // ② 음성 파일 → ③ TTS
  // 「녹음된 목소리만」을 켜 두면 기계음으로 대신 읽지 않고 조용히 넘어간다.
  // 다만 2·3단계 글자(say-…)는 녹음 대상이 아니라 예외로 둔다 —
  // 여기까지 막으면 그 단계가 통째로 소리 없이 돌아간다.
  const optional = !!key && key.startsWith('say-');
  const allowTTS = optional || !state.settings.onlyRecordedVoice;
  if (key) playFile(key, () => { if (words && allowTTS) speak(words); });
  else if (words && allowTTS) speak(words);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (koVoice) u.voice = koVoice;
    u.rate = 0.85;
    u.pitch = 1.15;
    u.volume = vol();
    speechSynthesis.speak(u);
  } catch { /* 음성 없이 진행 */ }
}

export function stopVoice() {
  if (current) { try { current.pause(); } catch {} current = null; }
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch {} }
}

// ── 합성 효과음 ────────────────────────────────────────────
function tone({ freq = 440, dur = 0.18, type = 'sine', gain = 0.18, slide = 0, delay = 0 }) {
  if (!ctx || vol() <= 0) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain * vol(), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.2, gain = 0.3, delay = 0, lp = 900, hp = 0 }) {
  if (!ctx || vol() <= 0) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = hp ? 'highpass' : 'lowpass';
  filt.frequency.value = hp || lp;
  const g = ctx.createGain();
  g.gain.value = gain * vol();
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start(t0);
}

// ── 효과음도 슬롯 ──────────────────────────────────────────
//   ① 부모가 넣은 파일 (부모 메뉴에서 고름 · IndexedDB)
//   ② assets/sfx/<키>.mp3 · .wav
//   ③ 코드로 만든 기본 소리
// 효과음은 말소리를 끊지 않는다 (stopVoice 를 부르지 않음)
const sfxEls = new Map();

function playSfx(key, fallback) {
  if (vol() <= 0) return;
  const rec = recordedUrl(key);
  if (rec) {
    let el = sfxEls.get(key);
    if (!el || el.dataset.src !== rec) { el = new Audio(rec); el.dataset.src = rec; sfxEls.set(key, el); }
    el.volume = vol();
    el.currentTime = 0;
    el.play().catch(() => fallback());
    return;
  }
  const cached = fileCache.get(key);
  if (cached === null) { fallback(); return; }
  if (cached) { cached.volume = vol(); cached.currentTime = 0; cached.play().catch(() => {}); return; }

  let i = 0;
  const tryNext = () => {
    if (i >= EXTS.length) { fileCache.set(key, null); fallback(); return; }
    const el = new Audio(`assets/sfx/${key}.${EXTS[i++]}`);
    el.preload = 'auto';
    el.addEventListener('canplay', () => {
      fileCache.set(key, el);
      el.volume = vol();
      el.play().catch(() => {});
    }, { once: true });
    el.addEventListener('error', tryNext, { once: true });
    el.load();
  };
  tryNext();
}

/** 교체 가능한 효과음 슬롯 (부모 메뉴에서 파일로 바꿀 수 있음) */
export const SFX_SLOTS = [
  { key: 'sfx-next',   label: '다음 글자로 넘어갈 때', where: '글자 하나를 마치고 다음으로' },
  { key: 'sfx-stroke', label: '획을 하나 그었을 때',   where: '획 성공' },
  { key: 'sfx-open',   label: '선물 상자를 열 때',     where: '스티커 상자' },
  { key: 'sfx-pop',    label: '캐릭터가 나올 때',      where: '스티커 등장' },
  { key: 'sfx-stamp',  label: '도장을 찍을 때',        where: '참 잘했어요 도장' },
  { key: 'sfx-cheer',  label: '스티커북이 열릴 때',    where: '연출 마무리' },
];

// 기본 소리 — 모두 코드로 합성한 자체 사운드. 슬롯마다 고를 수 있는 프리셋을 둔다.
export const SFX_PRESETS = {
  'sfx-next': [
    {
      name: '반짝 아르페지오',
      play() {
        [784, 988, 1319, 1568].forEach((f, i) =>
          tone({ freq: f, dur: 0.17, type: 'triangle', gain: 0.15, delay: i * 0.065 }));
        tone({ freq: 2093, dur: 0.28, type: 'sine', gain: 0.1, delay: 0.27 });
        tone({ freq: 2637, dur: 0.34, type: 'sine', gain: 0.07, delay: 0.35 });
        noise({ dur: 0.5, gain: 0.05, hp: 5200, delay: 0.24 });
      },
    },
    {
      name: '요정 종소리',
      play() {
        [1319, 1760].forEach((f, i) =>
          tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.16, delay: i * 0.09 }));
        [2637, 3136, 3520].forEach((f, i) =>
          tone({ freq: f, dur: 0.42, type: 'sine', gain: 0.05, delay: 0.18 + i * 0.07 }));
        noise({ dur: 0.7, gain: 0.045, hp: 6000, delay: 0.1 });
      },
    },
    {
      name: '별가루 슬라이드',
      play() {
        tone({ freq: 440, dur: 0.34, type: 'triangle', gain: 0.16, slide: 1400 });
        [1568, 2093, 2637, 3136].forEach((f, i) =>
          tone({ freq: f, dur: 0.22, type: 'sine', gain: 0.07, delay: 0.2 + i * 0.05 }));
        noise({ dur: 0.55, gain: 0.06, hp: 4500, delay: 0.18 });
      },
    },
  ],
  'sfx-cheer': [
    {
      name: '팡파르',
      play() {
        [523, 659, 784, 1047].forEach((f, i) =>
          tone({ freq: f, dur: 0.26, type: 'triangle', gain: 0.14, delay: i * 0.1 }));
        noise({ dur: 0.6, gain: 0.05, hp: 4800, delay: 0.3 });
      },
    },
    {
      name: '반짝 폭죽',
      play() {
        noise({ dur: 0.3, gain: 0.12, hp: 3000 });
        [1047, 1319, 1568, 2093].forEach((f, i) =>
          tone({ freq: f, dur: 0.3, type: 'sine', gain: 0.1, delay: 0.08 + i * 0.06 }));
        noise({ dur: 0.8, gain: 0.05, hp: 6500, delay: 0.25 });
      },
    },
  ],
  'sfx-stroke': [
    { name: '삐릭', play() { tone({ freq: 620, dur: 0.12, type: 'triangle', gain: 0.12, slide: 240 }); } },
    { name: '물방울', play() { tone({ freq: 900, dur: 0.16, type: 'sine', gain: 0.13, slide: -380 }); } },
  ],
  'sfx-open': [
    {
      name: '상자 열기',
      play() {
        noise({ dur: 0.25, gain: 0.18, lp: 2200 });
        tone({ freq: 520, dur: 0.2, type: 'sine', gain: 0.14, slide: 500, delay: 0.05 });
      },
    },
  ],
  'sfx-pop': [
    { name: '뽕', play() { tone({ freq: 300, dur: 0.16, type: 'sine', gain: 0.2, slide: 700 }); } },
  ],
  'sfx-stamp': [
    {
      name: '쿵',
      play() {
        noise({ dur: 0.22, gain: 0.5, lp: 520 });
        tone({ freq: 140, dur: 0.22, type: 'sine', gain: 0.3, slide: -60 });
      },
    },
  ],
};

function builtinPlay(key) {
  const list = SFX_PRESETS[key];
  if (!list || !list.length) return () => {};
  const idx = Math.min(list.length - 1, Number(state.settings.sfxPreset?.[key] ?? 0));
  return () => list[idx].play();
}

/** 슬롯 하나를 미리 들어보기 (부모 메뉴용). n 을 주면 그 프리셋을 바로 들려준다 */
export function previewSfx(key, n = null) {
  if (n !== null) { SFX_PRESETS[key]?.[n]?.play(); return; }
  playSfx(key, builtinPlay(key));
}

export const sfx = {
  stroke() { playSfx('sfx-stroke', builtinPlay('sfx-stroke')); },
  charPass() { playSfx('sfx-next', builtinPlay('sfx-next')); },
  boxOpen() { playSfx('sfx-open', builtinPlay('sfx-open')); },
  pop() { playSfx('sfx-pop', builtinPlay('sfx-pop')); },
  stamp() { playSfx('sfx-stamp', builtinPlay('sfx-stamp')); },
  fanfare() { playSfx('sfx-cheer', builtinPlay('sfx-cheer')); },
  // 파일로 바꿀 필요가 없는 작은 소리들
  soft() { tone({ freq: 420, dur: 0.2, type: 'sine', gain: 0.12, slide: 60 }); },
  tap() { tone({ freq: 520, dur: 0.07, type: 'square', gain: 0.07 }); },
};
