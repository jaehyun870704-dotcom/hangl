// ============================================================
// 스티커 슬롯 (PRD 6.1 — 에셋 교체 가능 구조)
//   assets/stickers/stickers.json 의 메타데이터 + 01.png ~ NN.png 이미지
//   이미지 파일이 없으면 코드로 그린 임시 캐릭터(플레이스홀더)를 쓴다.
//   → 이미지만 갈아끼우면 전체 캐릭터 세트가 교체된다. 코드 수정 불필요.
//   캐릭터 수는 stickers.json 의 항목 수가 정한다.
// ============================================================

import { saveClip, deleteClip, recordedUrl, hasClip } from './voicebank.js';

const DIR = 'assets/stickers/';
const MAX_PX = 512;          // 올린 그림은 이 크기로 줄여 저장한다

/** 기기에 올려 둔 그림의 보관 키 */
const imageKey = (slot) => `img-${String(slot).padStart(2, '0')}`;

export const hasStickerImage = (slot) => hasClip(imageKey(slot));

/** 그림 파일을 올린다. 큰 사진은 512px 로 줄여 저장한다 */
export async function saveStickerImage(slot, file) {
  const small = await shrinkImage(file);
  await saveClip(imageKey(slot), small);
  imageOk.delete(slot);
}

/** 올린 그림을 지우고 기본 그림으로 되돌린다 */
export async function clearStickerImage(slot) {
  await deleteClip(imageKey(slot));
  imageOk.delete(slot);
}

/** 사진을 정사각 512px 안에 맞춰 줄인다 (원본 비율 유지, 투명 배경 보존) */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('그림을 바꾸지 못했습니다'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('그림을 읽지 못했습니다')); };
    img.src = url;
  });
}

/**
 * stickers.json 을 못 읽는 경우(또는 아직 읽는 중)의 대체 메타데이터.
 * voice 키는 반드시 실제와 같은 이름이어야 한다 — 다르면 녹음이 엉뚱한 이름으로 저장된다.
 */
/** stickers.json 을 읽기 전에 쓰는 기본 개수. json 과 같아야 한다 */
export const SLOT_COUNT = 10;

const FALLBACK = Array.from({ length: SLOT_COUNT }, (_, i) => ({
  id: i + 1,
  file: `${String(i + 1).padStart(2, '0')}.png`,
  name: `친구 ${i + 1}`,
  trait: '',
  voice: `sticker-${String(i + 1).padStart(2, '0')}.mp3`,
}));

let META = FALLBACK;
let OVERRIDES = {};          // slot -> { name, trait } : 부모가 바꾼 이름
const imageOk = new Map();   // slot -> boolean

/** 부모가 정한 이름을 적용한다 (store 가 불러온 뒤 넘겨준다) */
export function setNameOverrides(map) { OVERRIDES = map || {}; }

export async function loadStickerMeta() {
  try {
    const res = await fetch(`${DIR}stickers.json`, { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length) META = json;
    }
  } catch { /* 기본 메타데이터로 진행 */ }
  return META;
}

export const stickerMeta = (slot) => {
  const base = META[slot - 1] || FALLBACK[slot - 1];
  const own = OVERRIDES[slot];
  return own && own.name ? { ...base, ...own } : base;
};
export const stickerCount = () => META.length || SLOT_COUNT;

/** 음성 파일 키 (assets/audio/<key>.mp3). 없으면 TTS로 이름을 읽는다 */
export function stickerVoiceKey(slot) {
  const v = stickerMeta(slot)?.voice;
  return v ? v.replace(/\.[a-z0-9]+$/i, '') : `sticker-${String(slot).padStart(2, '0')}`;
}

/** 화면에서 읽어줄 문구 */
export function stickerLabel(slot) {
  const m = stickerMeta(slot);
  return m.trait ? `${m.trait} ${m.name}` : m.name;
}

// ── 기본 캐릭터 그림 (이미지를 넣기 전까지 쓰는 코드 그림) ──
//   10명이 저마다 다른 모양이라 4세 아이도 한눈에 구분한다.
//   assets/stickers/01.png … 를 넣으면 그 그림으로 바뀐다.

function esc(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

/** 공통 얼굴 — 큰 눈, 볼터치, 방긋 웃는 입 */
function face(cx, cy, s = 1, style = 0) {
  const eyes = style === 1
    ? `<path d="M${cx - 13 * s} ${cy + 2 * s} q ${4 * s} ${-8 * s} ${8 * s} 0"
         stroke="#4A3B2A" stroke-width="${3.4 * s}" fill="none" stroke-linecap="round"/>
       <path d="M${cx + 5 * s} ${cy + 2 * s} q ${4 * s} ${-8 * s} ${8 * s} 0"
         stroke="#4A3B2A" stroke-width="${3.4 * s}" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="${cx - 9 * s}" cy="${cy}" rx="${6.2 * s}" ry="${7.6 * s}" fill="#4A3B2A"/>
       <ellipse cx="${cx + 9 * s}" cy="${cy}" rx="${6.2 * s}" ry="${7.6 * s}" fill="#4A3B2A"/>
       <circle cx="${cx - 6.6 * s}" cy="${cy - 3 * s}" r="${2.3 * s}" fill="#fff"/>
       <circle cx="${cx + 11.4 * s}" cy="${cy - 3 * s}" r="${2.3 * s}" fill="#fff"/>`;
  return `${eyes}
    <path d="M${cx - 5 * s} ${cy + 9 * s} q ${5 * s} ${5.5 * s} ${10 * s} 0"
      stroke="#8A6552" stroke-width="${2.4 * s}" fill="none" stroke-linecap="round"/>
    <circle cx="${cx - 15 * s}" cy="${cy + 6 * s}" r="${5 * s}" fill="#FF9DBB" opacity=".4"/>
    <circle cx="${cx + 15 * s}" cy="${cy + 6 * s}" r="${5 * s}" fill="#FF9DBB" opacity=".4"/>`;
}

/** 10명의 모양 — 실루엣이 전부 다르다 */
const CHARS = [
  { // 1 별
    light: '#FFF0BE', base: '#FFC45C',
    art: (g) => `<path d="M50 13 L60 38 L86 40 L66 57 L72 83 L50 69 L28 83 L34 57 L14 40 L40 38 Z"
      fill="url(#${g})" stroke="#F0B040" stroke-width="2" stroke-linejoin="round"/>
      ${face(50, 50, 0.82)}`,
  },
  { // 2 구름
    light: '#F2F8FF', base: '#A8C8F0',
    art: (g) => `<g fill="url(#${g})" stroke="#8FB4E4" stroke-width="2">
        <circle cx="34" cy="57" r="17"/><circle cx="52" cy="46" r="21"/><circle cx="70" cy="57" r="16"/>
        <rect x="24" y="54" width="54" height="24" rx="12"/>
      </g>
      <g fill="url(#${g})"><circle cx="34" cy="57" r="15"/><circle cx="52" cy="46" r="19"/>
        <circle cx="70" cy="57" r="14"/><rect x="26" y="55" width="50" height="21" rx="10.5"/></g>
      ${face(51, 54, 0.86, 1)}`,
  },
  { // 3 하트
    light: '#FFE3EC', base: '#FF9DBB',
    art: (g) => `<path d="M50 84 C18 62 16 38 32 30 C42 25 50 33 50 40 C50 33 58 25 68 30 C84 38 82 62 50 84 Z"
      fill="url(#${g})" stroke="#F080A4" stroke-width="2" stroke-linejoin="round"/>
      ${face(50, 52, 0.82)}`,
  },
  { // 4 무지개
    light: '#FFFFFF', base: '#D8C6F0',
    art: (g) => `<g fill="none" stroke-linecap="round">
        <path d="M16 60 A34 34 0 0 1 84 60" stroke="#FF9DBB" stroke-width="9"/>
        <path d="M25 60 A25 25 0 0 1 75 60" stroke="#FFC45C" stroke-width="9"/>
        <path d="M34 60 A16 16 0 0 1 66 60" stroke="#7FC9E0" stroke-width="9"/>
      </g>
      <rect x="25" y="56" width="50" height="34" rx="17" fill="url(#${g})" stroke="#C3ADE4" stroke-width="2"/>
      ${face(50, 70, 0.78)}`,
  },
  { // 5 초승달
    light: '#FFF8DC', base: '#F0C36A',
    art: (g) => `<path d="M64 14 A38 38 0 1 0 64 86 A30 30 0 1 1 64 14 Z"
      fill="url(#${g})" stroke="#DCA83F" stroke-width="2" stroke-linejoin="round"/>
      ${face(40, 50, 0.78, 1)}`,
  },
  { // 6 꽃
    light: '#FFE6D6', base: '#FFA579',
    art: (g) => `<g fill="url(#${g})" stroke="#F08C5C" stroke-width="2">
        <circle cx="50" cy="24" r="16"/><circle cx="75" cy="42" r="16"/>
        <circle cx="65" cy="71" r="16"/><circle cx="35" cy="71" r="16"/><circle cx="25" cy="42" r="16"/>
      </g>
      <circle cx="50" cy="50" r="23" fill="#FFF6EC" stroke="#F08C5C" stroke-width="2"/>
      ${face(50, 48, 0.72)}`,
  },
  { // 7 눈송이
    light: '#F0FBFF', base: '#7FC9E0',
    art: (g) => `<g stroke="#6FB8D0" stroke-width="7" stroke-linecap="round">
        <path d="M50 20 V80 M24 35 L76 65 M76 35 L24 65"/>
      </g>
      <g stroke="#A8DFF0" stroke-width="4" stroke-linecap="round">
        <path d="M50 24 l-7 8 M50 24 l7 8 M50 76 l-7 -8 M50 76 l7 -8"/>
      </g>
      <circle cx="50" cy="50" r="26" fill="url(#${g})" stroke="#6FB8D0" stroke-width="2"/>
      ${face(50, 49, 0.8)}`,
  },
  { // 8 물방울
    light: '#E0F8FC', base: '#5FC6D8',
    art: (g) => `<path d="M50 12 C66 38 77 50 77 63 A27 27 0 1 1 23 63 C23 50 34 38 50 12 Z"
      fill="url(#${g})" stroke="#48AFC2" stroke-width="2" stroke-linejoin="round"/>
      ${face(50, 62, 0.82, 1)}`,
  },
  { // 9 솜사탕
    light: '#FBEEFF', base: '#C89BE8',
    art: (g) => `<rect x="46.5" y="62" width="7" height="30" rx="3.5" fill="#E4C9A0" stroke="#C9A87C" stroke-width="1.5"/>
      <g fill="url(#${g})" stroke="#B184D8" stroke-width="2">
        <circle cx="34" cy="46" r="18"/><circle cx="66" cy="46" r="18"/>
        <circle cx="50" cy="34" r="19"/><circle cx="50" cy="56" r="20"/>
      </g>
      <g fill="url(#${g})"><circle cx="34" cy="46" r="16"/><circle cx="66" cy="46" r="16"/>
        <circle cx="50" cy="34" r="17"/><circle cx="50" cy="56" r="18"/></g>
      ${face(50, 48, 0.78)}`,
  },
  { // 10 반딧불
    light: '#F4FFE0', base: '#9DCB63',
    art: (g) => `<circle cx="50" cy="56" r="36" fill="#DFF5B0" opacity=".45"/>
      <g stroke="#7FA84E" stroke-width="2.5" fill="none" stroke-linecap="round">
        <path d="M40 30 q-4 -10 -10 -12 M60 30 q4 -10 10 -12"/>
      </g>
      <circle cx="29" cy="20" r="3.5" fill="#FFE066"/><circle cx="71" cy="20" r="3.5" fill="#FFE066"/>
      <ellipse cx="24" cy="46" rx="15" ry="10" fill="#FFFFFF" opacity=".75" transform="rotate(-20 24 46)"/>
      <ellipse cx="76" cy="46" rx="15" ry="10" fill="#FFFFFF" opacity=".75" transform="rotate(20 76 46)"/>
      <circle cx="50" cy="56" r="26" fill="url(#${g})" stroke="#86B44F" stroke-width="2"/>
      ${face(50, 54, 0.8)}`,
  },
];

/** 슬롯 번호에 해당하는 기본 캐릭터 SVG */
export function placeholderSVG(slot) {
  const c = CHARS[(slot - 1) % CHARS.length];
  const gid = `cg${slot}`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <radialGradient id="${gid}" cx="35%" cy="26%" r="80%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="40%" stop-color="${c.light}"/>
        <stop offset="100%" stop-color="${c.base}"/>
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="93" rx="24" ry="5" fill="#000" opacity=".07"/>
    ${c.art(gid)}
  </svg>`;
}

/**
 * 스티커 그림 엘리먼트.
 * 우선 assets/stickers/NN.png 를 시도하고, 없으면 플레이스홀더 SVG를 유지한다.
 */
export function stickerArt(slot, { className = 'art' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.innerHTML = placeholderSVG(slot);
  const svg = wrap.querySelector('svg');
  if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }

  const meta = stickerMeta(slot);
  const show = (el) => {
    wrap.innerHTML = '';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.objectFit = 'contain';
    el.alt = esc(meta.name || '');
    wrap.appendChild(el);
  };

  // ① 부모가 앱에서 올린 그림 (태블릿에서도 이 방법으로 넣는다)
  const own = recordedUrl(imageKey(slot));
  if (own) {
    const up = new Image();
    up.onload = () => show(up);
    up.src = own;
    return wrap;
  }

  // ② assets/stickers 폴더의 그림 → ③ 코드로 그린 기본 캐릭터
  if (imageOk.get(slot) === false) return wrap;

  const img = new Image();
  img.onload = () => { imageOk.set(slot, true); show(img); };
  img.onerror = () => imageOk.set(slot, false);
  img.src = DIR + (meta.file || `${String(slot).padStart(2, '0')}.png`);
  return wrap;
}
