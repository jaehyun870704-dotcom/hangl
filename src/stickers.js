// ============================================================
// 스티커 슬롯 (PRD 6.1 — 에셋 교체 가능 구조)
//   단계마다 친구 10명이 따로 있다. 모두 30명.
//     1단계 자모 : 하늘 친구 (별 구름 하트 …)      키 sticker-01 · 그림 01.png
//     2단계 글자 : 먹을 것 친구 (딸기 사과 레몬 …) 키 sticker-s2-01 · 그림 s2-01.png
//     3단계 낱말 : 동물 친구 (고양이 강아지 …)     키 sticker-s3-01 · 그림 s3-01.png
//
//   1단계 키에 접두어가 없는 것은 일부러다. 이미 녹음해 둔
//   sticker-01 … sticker-10 이 그대로 살아 있어야 하기 때문이다.
//
//   assets/stickers/stickers.json 의 메타데이터 + NN.png 이미지
//   이미지 파일이 없으면 코드로 그린 캐릭터를 쓴다.
//   → 이미지만 갈아끼우면 전체 세트가 교체된다. 코드 수정 불필요.
// ============================================================

import { saveClip, deleteClip, recordedUrl, hasClip } from './voicebank.js';
import { STAGES, stageOf, DEFAULT_STAGE } from './curriculum.js';

const DIR = 'assets/stickers/';
const MAX_PX = 512;          // 올린 그림은 이 크기로 줄여 저장한다

/** 지금 아이가 하고 있는 단계. store 가 불러온 뒤 알려 준다 */
let ACTIVE = DEFAULT_STAGE;
export function setActiveStage(id) { ACTIVE = stageOf(id).id; }
export const activeStage = () => ACTIVE;

const pre = (stage) => stageOf(stage ?? ACTIVE).prefix;
const nn = (slot) => String(slot).padStart(2, '0');

/** 기기에 올려 둔 그림의 보관 키 */
export const imageKey = (slot, stage) => `img-${pre(stage)}${nn(slot)}`;

export const hasStickerImage = (slot, stage) => hasClip(imageKey(slot, stage));

/** 그림 파일을 올린다. 큰 사진은 512px 로 줄여 저장한다 */
export async function saveStickerImage(slot, file, stage) {
  const small = await shrinkImage(file);
  await saveClip(imageKey(slot, stage), small);
  imageOk.delete(imageKey(slot, stage));
}

/** 올린 그림을 지우고 기본 그림으로 되돌린다 */
export async function clearStickerImage(slot, stage) {
  await deleteClip(imageKey(slot, stage));
  imageOk.delete(imageKey(slot, stage));
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

/** stickers.json 을 읽기 전에 쓰는 기본 개수. json 과 같아야 한다 */
export const SLOT_COUNT = 10;

/**
 * stickers.json 을 못 읽는 경우(또는 아직 읽는 중)의 대체 메타데이터.
 * voice 키는 반드시 실제와 같은 이름이어야 한다 — 다르면 녹음이 엉뚱한 이름으로 저장된다.
 */
function fallbackFor(stageId) {
  const p = stageOf(stageId).prefix;
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({
    id: i + 1,
    file: `${p}${nn(i + 1)}.png`,
    name: `친구 ${i + 1}`,
    trait: '',
    voice: `sticker-${p}${nn(i + 1)}.mp3`,
  }));
}

/** 단계별 메타데이터 { stageId: [10개] } */
const META = Object.fromEntries(STAGES.map((s) => [s.id, fallbackFor(s.id)]));
let OVERRIDES = {};          // '단계:슬롯' -> { name, trait } : 부모가 바꾼 이름
const imageOk = new Map();   // imageKey -> boolean

/** 부모가 정한 이름을 적용한다 (store 가 불러온 뒤 넘겨준다) */
export function setNameOverrides(map) { OVERRIDES = map || {}; }

/** 이름 저장 키. 1단계는 옛 형식(숫자만)을 그대로 써서 기존 저장값을 잃지 않는다 */
export const nameKey = (slot, stage) => {
  const id = stageOf(stage ?? ACTIVE).id;
  return id === 'jamo' ? String(slot) : `${id}:${slot}`;
};

export async function loadStickerMeta() {
  try {
    const res = await fetch(`${DIR}stickers.json`, { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      // 옛 형식(배열 하나)은 1단계 것으로 본다
      if (Array.isArray(json)) {
        if (json.length) META.jamo = json;
      } else if (json && typeof json === 'object') {
        for (const s of STAGES) {
          if (Array.isArray(json[s.id]) && json[s.id].length) META[s.id] = json[s.id];
        }
      }
    }
  } catch { /* 기본 메타데이터로 진행 */ }
  return META;
}

export const stickerMeta = (slot, stage) => {
  const id = stageOf(stage ?? ACTIVE).id;
  const base = META[id][slot - 1] || fallbackFor(id)[slot - 1];
  const own = OVERRIDES[nameKey(slot, id)];
  return own && own.name ? { ...base, ...own } : base;
};

export const stickerCount = (stage) => META[stageOf(stage ?? ACTIVE).id].length || SLOT_COUNT;

/** 음성 파일 키 (assets/audio/<key>.mp3). 없으면 TTS로 이름을 읽는다 */
export function stickerVoiceKey(slot, stage) {
  const v = stickerMeta(slot, stage)?.voice;
  return v ? v.replace(/\.[a-z0-9]+$/i, '') : `sticker-${pre(stage)}${nn(slot)}`;
}

/** 화면에서 읽어줄 문구 */
export function stickerLabel(slot, stage) {
  const m = stickerMeta(slot, stage);
  return m.trait ? `${m.trait} ${m.name}` : m.name;
}

// ── 기본 캐릭터 그림 (이미지를 넣기 전까지 쓰는 코드 그림) ──
//   30명이 저마다 다른 실루엣이라 4세 아이도 한눈에 구분한다.
//   assets/stickers/01.png · s2-01.png … 를 넣으면 그 그림으로 바뀐다.

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

/** 눈만 (부엉이·개구리처럼 눈을 따로 그리는 친구용 입·볼터치) */
function smile(cx, cy, s = 1) {
  return `<path d="M${cx - 5 * s} ${cy} q ${5 * s} ${5.5 * s} ${10 * s} 0"
      stroke="#8A6552" stroke-width="${2.4 * s}" fill="none" stroke-linecap="round"/>
    <circle cx="${cx - 16 * s}" cy="${cy - 1 * s}" r="${5 * s}" fill="#FF9DBB" opacity=".4"/>
    <circle cx="${cx + 16 * s}" cy="${cy - 1 * s}" r="${5 * s}" fill="#FF9DBB" opacity=".4"/>`;
}

/** 30명의 모양 — 1단계 하늘 · 2단계 먹을 것 · 3단계 동물 */
const CHARS = [
  // ── 1단계 · 하늘 친구 ────────────────────────────────
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

  // ── 2단계 · 먹을 것 친구 ──────────────────────────────
  { // 11 딸기
    light: '#FFE0E4', base: '#F0607A',
    art: (g) => `<path d="M50 90 C22 74 22 46 34 36 C42 29 58 29 66 36 C78 46 78 74 50 90 Z"
        fill="url(#${g})" stroke="#D8455F" stroke-width="2" stroke-linejoin="round"/>
      <g fill="#6FB55C" stroke="#559444" stroke-width="1.6" stroke-linejoin="round">
        <path d="M50 36 L28 24 L44 22 L38 10 L50 18 L62 10 L56 22 L72 24 Z"/>
      </g>
      <g fill="#FFE9A8"><circle cx="34" cy="58" r="2.6"/><circle cx="66" cy="58" r="2.6"/>
        <circle cx="42" cy="76" r="2.6"/><circle cx="58" cy="76" r="2.6"/><circle cx="50" cy="66" r="2.6"/></g>
      ${face(50, 56, 0.76)}`,
  },
  { // 12 사과
    light: '#FFE2DC', base: '#F0604C',
    art: (g) => `<path d="M50 34 C41 22 20 28 20 50 C20 72 36 90 50 90 C64 90 80 72 80 50 C80 28 59 22 50 34 Z"
        fill="url(#${g})" stroke="#D24838" stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 32 C50 22 49 16 47 10" stroke="#8A6552" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="62" cy="18" rx="12" ry="6" fill="#6FB55C" stroke="#559444" stroke-width="1.6"
        transform="rotate(-22 62 18)"/>
      ${face(50, 56, 0.82)}`,
  },
  { // 13 레몬
    light: '#FFFBDC', base: '#F2CE3E',
    art: (g) => `<ellipse cx="50" cy="52" rx="35" ry="26" fill="url(#${g})" stroke="#D9B325"
        stroke-width="2" transform="rotate(-10 50 52)"/>
      <path d="M13 46 q-7 -2 -9 -5 M87 58 q7 2 9 5" stroke="#D9B325" stroke-width="4"
        fill="none" stroke-linecap="round"/>
      ${face(50, 52, 0.8)}`,
  },
  { // 14 수박
    light: '#FFD9DE', base: '#F0637A',
    art: (g) => `<path d="M12 64 A38 38 0 0 1 88 64 Z" fill="#7FBF5C" stroke="#5D9943"
        stroke-width="2" stroke-linejoin="round"/>
      <path d="M18 64 A32 32 0 0 1 82 64 Z" fill="#EAF6DE"/>
      <path d="M23 64 A27 27 0 0 1 77 64 Z" fill="url(#${g})" stroke="#D8455F" stroke-width="1.6"/>
      <g fill="#4A3B2A"><ellipse cx="33" cy="56" rx="2.4" ry="3.4"/><ellipse cx="67" cy="56" rx="2.4" ry="3.4"/>
        <ellipse cx="50" cy="60" rx="2.4" ry="3.4"/></g>
      ${face(50, 46, 0.72)}`,
  },
  { // 15 아이스크림
    light: '#FFF0F8', base: '#F09BC6',
    art: (g) => `<path d="M31 50 L50 93 L69 50 Z" fill="#E8B96A" stroke="#C99A4C"
        stroke-width="2" stroke-linejoin="round"/>
      <g stroke="#C99A4C" stroke-width="1.6" opacity=".8">
        <path d="M37 58 L57 66 M43 72 L60 58 M45 80 L62 72"/></g>
      <circle cx="50" cy="38" r="25" fill="url(#${g})" stroke="#DB7FAE" stroke-width="2"/>
      <circle cx="33" cy="46" r="12" fill="url(#${g})" stroke="#DB7FAE" stroke-width="2"/>
      <circle cx="67" cy="46" r="12" fill="url(#${g})" stroke="#DB7FAE" stroke-width="2"/>
      <circle cx="50" cy="12" r="5" fill="#F0604C"/>
      ${face(50, 38, 0.78)}`,
  },
  { // 16 컵케이크
    light: '#FFF4E0', base: '#F0B96A',
    art: (g) => `<path d="M28 56 q3 -22 22 -22 q19 0 22 22 Z" fill="#F09BC6" stroke="#DB7FAE"
        stroke-width="2" stroke-linejoin="round"/>
      <circle cx="50" cy="26" r="5" fill="#F0604C"/>
      <path d="M27 54 h46 l-6 38 h-34 Z" fill="url(#${g})" stroke="#D89B4C"
        stroke-width="2" stroke-linejoin="round"/>
      <g stroke="#D89B4C" stroke-width="1.8" opacity=".7"><path d="M38 56 L36 90 M50 56 L50 90 M62 56 L64 90"/></g>
      ${face(50, 70, 0.72)}`,
  },
  { // 17 막대사탕
    light: '#FFEAF6', base: '#E87BB4',
    art: (g) => `<rect x="46.5" y="60" width="7" height="34" rx="3.5" fill="#F0E4CE" stroke="#C9A87C" stroke-width="1.6"/>
      <circle cx="50" cy="42" r="31" fill="url(#${g})" stroke="#CF5F99" stroke-width="2"/>
      <path d="M50 11 A31 31 0 0 1 81 42" stroke="#FFFFFF" stroke-width="7" fill="none" opacity=".7"/>
      <path d="M50 73 A31 31 0 0 1 19 42" stroke="#FFFFFF" stroke-width="7" fill="none" opacity=".7"/>
      ${face(50, 42, 0.8)}`,
  },
  { // 18 쿠키
    light: '#FFEBCE', base: '#D9A566',
    art: (g) => `<circle cx="50" cy="52" r="35" fill="url(#${g})" stroke="#B98748" stroke-width="2"/>
      <g fill="#7A5230"><circle cx="28" cy="34" r="4.6"/><circle cx="72" cy="34" r="4.6"/>
        <circle cx="24" cy="64" r="4.2"/><circle cx="76" cy="64" r="4.2"/><circle cx="50" cy="80" r="4.6"/></g>
      ${face(50, 52, 0.82)}`,
  },
  { // 19 우유
    light: '#FFFFFF', base: '#BFD9F0',
    art: (g) => `<path d="M28 40 L50 20 L72 40 Z" fill="url(#${g})" stroke="#8FB4E4"
        stroke-width="2" stroke-linejoin="round"/>
      <path d="M28 40 h44 v46 a5 5 0 0 1 -5 5 h-34 a5 5 0 0 1 -5 -5 Z"
        fill="url(#${g})" stroke="#8FB4E4" stroke-width="2" stroke-linejoin="round"/>
      <rect x="34" y="46" width="32" height="12" rx="4" fill="#8FB4E4" opacity=".35"/>
      ${face(50, 72, 0.76)}`,
  },
  { // 20 체리
    light: '#FFDCE4', base: '#DB4E68',
    art: (g) => `<path d="M50 60 C50 38 54 22 66 12" stroke="#6FB55C" stroke-width="4"
        fill="none" stroke-linecap="round"/>
      <ellipse cx="80" cy="14" rx="13" ry="6.5" fill="#6FB55C" stroke="#559444"
        stroke-width="1.6" transform="rotate(-18 80 14)"/>
      <circle cx="50" cy="60" r="29" fill="url(#${g})" stroke="#BC3A52" stroke-width="2"/>
      <ellipse cx="38" cy="48" rx="7" ry="4.5" fill="#FFFFFF" opacity=".45" transform="rotate(-30 38 48)"/>
      ${face(50, 60, 0.8)}`,
  },

  // ── 3단계 · 동물 친구 ─────────────────────────────────
  { // 21 고양이
    light: '#FFF3E0', base: '#F0B46A',
    art: (g) => `<path d="M24 36 L20 10 L45 22 Z" fill="url(#${g})" stroke="#D6924C"
        stroke-width="2" stroke-linejoin="round"/>
      <path d="M76 36 L80 10 L55 22 Z" fill="url(#${g})" stroke="#D6924C"
        stroke-width="2" stroke-linejoin="round"/>
      <circle cx="50" cy="56" r="32" fill="url(#${g})" stroke="#D6924C" stroke-width="2"/>
      <g stroke="#D6924C" stroke-width="2" stroke-linecap="round" opacity=".85">
        <path d="M20 56 h-14 M20 64 l-13 5 M80 56 h14 M80 64 l13 5"/></g>
      <path d="M46 62 L54 62 L50 67 Z" fill="#E88AA0"/>
      ${face(50, 52, 0.8)}`,
  },
  { // 22 강아지
    light: '#FFF0DE', base: '#C9945C',
    art: (g) => `<ellipse cx="18" cy="52" rx="12" ry="22" fill="#A87843" stroke="#8A6134" stroke-width="2"/>
      <ellipse cx="82" cy="52" rx="12" ry="22" fill="#A87843" stroke="#8A6134" stroke-width="2"/>
      <circle cx="50" cy="52" r="31" fill="url(#${g})" stroke="#A87843" stroke-width="2"/>
      <ellipse cx="50" cy="68" rx="18" ry="13" fill="#FFF6E8" stroke="#D8B58A" stroke-width="1.6"/>
      <ellipse cx="50" cy="61" rx="6" ry="4.6" fill="#4A3B2A"/>
      <path d="M50 65 v5 M50 70 q-5 5 -10 2 M50 70 q5 5 10 2"
        stroke="#8A6552" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="38" cy="46" rx="5.6" ry="7" fill="#4A3B2A"/>
      <ellipse cx="62" cy="46" rx="5.6" ry="7" fill="#4A3B2A"/>
      <circle cx="40" cy="43" r="2.1" fill="#fff"/><circle cx="64" cy="43" r="2.1" fill="#fff"/>
      <circle cx="26" cy="58" r="5" fill="#FF9DBB" opacity=".35"/>
      <circle cx="74" cy="58" r="5" fill="#FF9DBB" opacity=".35"/>`,
  },
  { // 23 토끼
    light: '#FFFDFB', base: '#E4D9F0',
    art: (g) => `<ellipse cx="36" cy="22" rx="10" ry="22" fill="url(#${g})" stroke="#C3B4D8" stroke-width="2"/>
      <ellipse cx="64" cy="22" rx="10" ry="22" fill="url(#${g})" stroke="#C3B4D8" stroke-width="2"/>
      <ellipse cx="36" cy="24" rx="5" ry="15" fill="#FFC8D8"/>
      <ellipse cx="64" cy="24" rx="5" ry="15" fill="#FFC8D8"/>
      <circle cx="50" cy="60" r="29" fill="url(#${g})" stroke="#C3B4D8" stroke-width="2"/>
      <path d="M47 64 L53 64 L50 68 Z" fill="#E88AA0"/>
      ${face(50, 56, 0.78)}`,
  },
  { // 24 곰
    light: '#F5E3CE', base: '#B98A5E',
    art: (g) => `<circle cx="22" cy="28" r="14" fill="url(#${g})" stroke="#9A6E47" stroke-width="2"/>
      <circle cx="78" cy="28" r="14" fill="url(#${g})" stroke="#9A6E47" stroke-width="2"/>
      <circle cx="22" cy="28" r="7" fill="#E8B68F"/><circle cx="78" cy="28" r="7" fill="#E8B68F"/>
      <circle cx="50" cy="56" r="33" fill="url(#${g})" stroke="#9A6E47" stroke-width="2"/>
      <ellipse cx="50" cy="70" rx="19" ry="14" fill="#F2DCC2" stroke="#D4B48E" stroke-width="1.6"/>
      <ellipse cx="50" cy="63" rx="6.5" ry="5" fill="#4A3B2A"/>
      <path d="M50 68 v4 M50 72 q-5 5 -10 2 M50 72 q5 5 10 2"
        stroke="#8A6552" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="37" cy="48" rx="5.4" ry="6.8" fill="#4A3B2A"/>
      <ellipse cx="63" cy="48" rx="5.4" ry="6.8" fill="#4A3B2A"/>
      <circle cx="39" cy="45" r="2" fill="#fff"/><circle cx="65" cy="45" r="2" fill="#fff"/>`,
  },
  { // 25 여우
    light: '#FFE4CE', base: '#EE8A47',
    art: (g) => `<path d="M23 42 L16 8 L48 26 Z" fill="url(#${g})" stroke="#CE6E2E"
        stroke-width="2" stroke-linejoin="round"/>
      <path d="M77 42 L84 8 L52 26 Z" fill="url(#${g})" stroke="#CE6E2E"
        stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 92 C16 74 16 44 50 24 C84 44 84 74 50 92 Z"
        fill="url(#${g})" stroke="#CE6E2E" stroke-width="2" stroke-linejoin="round"/>
      <path d="M50 92 C34 82 28 70 27 58 q23 8 46 0 C72 70 66 82 50 92 Z" fill="#FFF6EC" opacity=".9"/>
      <ellipse cx="50" cy="76" rx="5.5" ry="4.2" fill="#4A3B2A"/>
      ${face(50, 50, 0.78)}`,
  },
  { // 26 펭귄
    light: '#7C8FA8', base: '#3C4A5E',
    art: (g) => `<ellipse cx="16" cy="58" rx="9" ry="22" fill="#3C4A5E" transform="rotate(14 16 58)"/>
      <ellipse cx="84" cy="58" rx="9" ry="22" fill="#3C4A5E" transform="rotate(-14 84 58)"/>
      <ellipse cx="36" cy="92" rx="11" ry="5" fill="#F0A63E"/>
      <ellipse cx="64" cy="92" rx="11" ry="5" fill="#F0A63E"/>
      <ellipse cx="50" cy="52" rx="32" ry="38" fill="url(#${g})" stroke="#2D3949" stroke-width="2"/>
      <ellipse cx="50" cy="60" rx="22" ry="29" fill="#FFFDF7"/>
      <path d="M43 54 L57 54 L50 63 Z" fill="#F0A63E" stroke="#D28C28" stroke-width="1.4" stroke-linejoin="round"/>
      <ellipse cx="39" cy="42" rx="5.4" ry="6.6" fill="#2D3949"/>
      <ellipse cx="61" cy="42" rx="5.4" ry="6.6" fill="#2D3949"/>
      <circle cx="41" cy="39" r="2" fill="#fff"/><circle cx="63" cy="39" r="2" fill="#fff"/>
      <circle cx="28" cy="52" r="5" fill="#FF9DBB" opacity=".35"/>
      <circle cx="72" cy="52" r="5" fill="#FF9DBB" opacity=".35"/>`,
  },
  { // 27 병아리
    light: '#FFFAD6', base: '#F8D247',
    art: (g) => `<path d="M50 26 q-6 -12 0 -18 q5 8 10 4 q-2 10 -10 14 Z" fill="#F0C02E"/>
      <ellipse cx="36" cy="94" rx="9" ry="4" fill="#F0A63E"/>
      <ellipse cx="64" cy="94" rx="9" ry="4" fill="#F0A63E"/>
      <circle cx="50" cy="56" r="33" fill="url(#${g})" stroke="#DEB92C" stroke-width="2"/>
      <ellipse cx="22" cy="60" rx="10" ry="14" fill="#FBE585" stroke="#DEB92C" stroke-width="1.6"/>
      <path d="M43 62 L57 62 L50 70 Z" fill="#F0A63E" stroke="#D28C28" stroke-width="1.4" stroke-linejoin="round"/>
      <ellipse cx="39" cy="48" rx="5.4" ry="6.6" fill="#4A3B2A"/>
      <ellipse cx="61" cy="48" rx="5.4" ry="6.6" fill="#4A3B2A"/>
      <circle cx="41" cy="45" r="2" fill="#fff"/><circle cx="63" cy="45" r="2" fill="#fff"/>
      <circle cx="28" cy="58" r="5" fill="#FF9DBB" opacity=".35"/>
      <circle cx="72" cy="58" r="5" fill="#FF9DBB" opacity=".35"/>`,
  },
  { // 28 개구리
    light: '#E4F8CE', base: '#7EC24E',
    art: (g) => `<circle cx="28" cy="28" r="16" fill="url(#${g})" stroke="#5FA338" stroke-width="2"/>
      <circle cx="72" cy="28" r="16" fill="url(#${g})" stroke="#5FA338" stroke-width="2"/>
      <circle cx="28" cy="28" r="10" fill="#FFFDF7"/><circle cx="72" cy="28" r="10" fill="#FFFDF7"/>
      <circle cx="28" cy="30" r="5.6" fill="#4A3B2A"/><circle cx="72" cy="30" r="5.6" fill="#4A3B2A"/>
      <ellipse cx="50" cy="60" rx="36" ry="29" fill="url(#${g})" stroke="#5FA338" stroke-width="2"/>
      <path d="M26 58 q24 22 48 0" stroke="#4C8A2C" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="26" cy="66" r="6" fill="#FF9DBB" opacity=".35"/>
      <circle cx="74" cy="66" r="6" fill="#FF9DBB" opacity=".35"/>`,
  },
  { // 29 부엉이
    light: '#F0E0C8', base: '#A8834E',
    art: (g) => `<path d="M27 28 L20 8 L42 20 Z" fill="url(#${g})" stroke="#8A6738"
        stroke-width="2" stroke-linejoin="round"/>
      <path d="M73 28 L80 8 L58 20 Z" fill="url(#${g})" stroke="#8A6738"
        stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="50" cy="56" rx="32" ry="35" fill="url(#${g})" stroke="#8A6738" stroke-width="2"/>
      <path d="M24 62 q10 22 26 28 q16 -6 26 -28 q-26 10 -52 0 Z" fill="#E0C9A4" opacity=".8"/>
      <circle cx="35" cy="46" r="15" fill="#FFFDF7" stroke="#D8BE96" stroke-width="1.6"/>
      <circle cx="65" cy="46" r="15" fill="#FFFDF7" stroke="#D8BE96" stroke-width="1.6"/>
      <circle cx="35" cy="46" r="7" fill="#4A3B2A"/><circle cx="65" cy="46" r="7" fill="#4A3B2A"/>
      <circle cx="37.5" cy="43" r="2.4" fill="#fff"/><circle cx="67.5" cy="43" r="2.4" fill="#fff"/>
      <path d="M44 60 L56 60 L50 70 Z" fill="#F0A63E" stroke="#D28C28" stroke-width="1.4" stroke-linejoin="round"/>`,
  },
  { // 30 거북이
    light: '#DFF2D2', base: '#6FAE5C',
    art: (g) => `<circle cx="50" cy="30" r="20" fill="#A8D48E" stroke="#77A860" stroke-width="2"/>
      <ellipse cx="16" cy="80" rx="11" ry="8" fill="#A8D48E" stroke="#77A860" stroke-width="2"/>
      <ellipse cx="84" cy="80" rx="11" ry="8" fill="#A8D48E" stroke="#77A860" stroke-width="2"/>
      <path d="M14 78 A36 30 0 0 1 86 78 Z" fill="url(#${g})" stroke="#4F8A3E"
        stroke-width="2" stroke-linejoin="round"/>
      <g stroke="#4F8A3E" stroke-width="1.8" fill="none" opacity=".8">
        <path d="M50 48 V78 M28 62 L72 62 M32 78 L40 62 M68 78 L60 62"/></g>
      <rect x="12" y="76" width="76" height="9" rx="4.5" fill="#C9E6B4" stroke="#77A860" stroke-width="1.6"/>
      ${face(50, 28, 0.62)}`,
  },
];

/** 슬롯 번호에 해당하는 기본 캐릭터 SVG */
export function placeholderSVG(slot, stage) {
  const st = stageOf(stage ?? ACTIVE);
  const c = CHARS[(st.charBase + slot - 1) % CHARS.length];
  const gid = `cg${st.prefix}${slot}`;
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
 * 우선 부모가 올린 그림, 다음 assets/stickers/NN.png, 없으면 코드 그림.
 */
export function stickerArt(slot, { className = 'art', stage = null } = {}) {
  const st = stageOf(stage ?? ACTIVE).id;
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.innerHTML = placeholderSVG(slot, st);
  const svg = wrap.querySelector('svg');
  if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }

  const meta = stickerMeta(slot, st);
  const show = (el) => {
    wrap.innerHTML = '';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.objectFit = 'contain';
    el.alt = esc(meta.name || '');
    wrap.appendChild(el);
  };

  // ① 부모가 앱에서 올린 그림 (태블릿에서도 이 방법으로 넣는다)
  const ik = imageKey(slot, st);
  const own = recordedUrl(ik);
  if (own) {
    const up = new Image();
    up.onload = () => show(up);
    up.src = own;
    return wrap;
  }

  // ② assets/stickers 폴더의 그림 → ③ 코드로 그린 기본 캐릭터
  if (imageOk.get(ik) === false) return wrap;

  const img = new Image();
  img.onload = () => { imageOk.set(ik, true); show(img); };
  img.onerror = () => imageOk.set(ik, false);
  img.src = DIR + (meta.file || `${stageOf(st).prefix}${nn(slot)}.png`);
  return wrap;
}
