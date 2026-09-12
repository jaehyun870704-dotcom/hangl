// ============================================================
// 스티커 슬롯 (PRD 6.1 — 에셋 교체 가능 구조)
//   assets/stickers/stickers.json 의 메타데이터 + 01.png ~ NN.png 이미지
//   이미지 파일이 없으면 코드로 그린 임시 캐릭터(플레이스홀더)를 쓴다.
//   → 이미지만 갈아끼우면 전체 캐릭터 세트가 교체된다. 코드 수정 불필요.
//   캐릭터 수는 stickers.json 의 항목 수가 정한다.
// ============================================================

const DIR = 'assets/stickers/';

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
const imageOk = new Map();   // slot -> boolean

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

export const stickerMeta = (slot) => META[slot - 1] || FALLBACK[slot - 1];
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

// ── 플레이스홀더 캐릭터 생성 ───────────────────────────────
const PALETTE = [
  ['#FFD6E0', '#FF9DBB'], ['#BFE8DC', '#66C7AE'], ['#DCD3F5', '#A896E8'],
  ['#FFE9A8', '#FFC45C'], ['#CFE6FF', '#7FB6F0'], ['#FFD9C2', '#FFA579'],
  ['#E6F2C9', '#A8CF6B'], ['#F6D6FF', '#CE8FE8'], ['#C9EEF2', '#6FCBD8'],
  ['#FFE0D0', '#FF9E8A'], ['#E3E8FF', '#93A4F0'], ['#FFF0C9', '#F0C36A'],
];

function esc(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

/** 슬롯 번호로 결정되는 임시 캐릭터 SVG 문자열 */
export function placeholderSVG(slot) {
  const i = slot - 1;
  const [light, base] = PALETTE[i % PALETTE.length];
  const cat = i >= 12;                   // 13번부터 고양이 계열 (지금은 10종이라 전부 강아지)
  const eyeStyle = i % 3;                // 0 동글, 1 반달, 2 초롱
  const extra = i % 4;                   // 장식
  const gid = `g${slot}`;
  const ears = cat
    ? `<path d="M26 34 L24 12 L46 24 Z" fill="url(#${gid})" stroke="${base}" stroke-width="2" stroke-linejoin="round"/>
       <path d="M74 34 L76 12 L54 24 Z" fill="url(#${gid})" stroke="${base}" stroke-width="2" stroke-linejoin="round"/>
       <path d="M29 31 L28 19 L40 25 Z" fill="#FFC2D0" opacity=".85"/>
       <path d="M71 31 L72 19 L60 25 Z" fill="#FFC2D0" opacity=".85"/>`
    : `<ellipse cx="22" cy="44" rx="11" ry="18" fill="${base}" opacity=".95" transform="rotate(-12 22 44)"/>
       <ellipse cx="78" cy="44" rx="11" ry="18" fill="${base}" opacity=".95" transform="rotate(12 78 44)"/>`;

  const eyes = eyeStyle === 1
    ? `<path d="M36 54 q6 -8 12 0" stroke="#4A3B2A" stroke-width="4" fill="none" stroke-linecap="round"/>
       <path d="M52 54 q6 -8 12 0" stroke="#4A3B2A" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="42" cy="54" rx="${eyeStyle === 2 ? 7.5 : 6.5}" ry="${eyeStyle === 2 ? 9 : 8}" fill="#4A3B2A"/>
       <ellipse cx="58" cy="54" rx="${eyeStyle === 2 ? 7.5 : 6.5}" ry="${eyeStyle === 2 ? 9 : 8}" fill="#4A3B2A"/>
       <circle cx="44.4" cy="51" r="2.4" fill="#fff"/><circle cx="60.4" cy="51" r="2.4" fill="#fff"/>`;

  const deco = extra === 0
    ? `<circle cx="68" cy="36" r="7" fill="${base}" opacity=".55"/>`
    : extra === 1
    ? `<path d="M50 18 q4 -9 8 -2 q7 -2 3 6" fill="${base}" stroke="${base}" stroke-width="2" stroke-linejoin="round"/>`
    : extra === 2
    ? `<path d="M74 22 l2.6 5.6 6 .8 -4.4 4.4 1.1 6.2 -5.3-3 -5.3 3 1.1-6.2 -4.4-4.4 6-.8 Z" fill="#FFD86B" stroke="#E9B93F" stroke-width="1.2" stroke-linejoin="round"/>`
    : '';

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <radialGradient id="${gid}" cx="35%" cy="28%" r="78%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="42%" stop-color="${light}"/>
        <stop offset="100%" stop-color="${base}"/>
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="90" rx="27" ry="6" fill="#000" opacity=".07"/>
    ${ears}
    <circle cx="50" cy="56" r="32" fill="url(#${gid})"/>
    <circle cx="50" cy="56" r="32" fill="none" stroke="${base}" stroke-width="1.5" opacity=".6"/>
    ${eyes}
    <ellipse cx="50" cy="68" rx="11" ry="8" fill="#FFF" opacity=".75"/>
    <path d="M45 65 h10 l-5 5 Z" fill="#8A6552"/>
    <path d="M50 70 q-5 6 -9 2 M50 70 q5 6 9 2" stroke="#8A6552" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="30" cy="64" r="6" fill="#FF9DBB" opacity=".45"/>
    <circle cx="70" cy="64" r="6" fill="#FF9DBB" opacity=".45"/>
    ${deco}
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

  if (imageOk.get(slot) === false) return wrap;

  const meta = stickerMeta(slot);
  const img = new Image();
  img.onload = () => {
    imageOk.set(slot, true);
    wrap.innerHTML = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.alt = esc(meta.name || '');
    wrap.appendChild(img);
  };
  img.onerror = () => imageOk.set(slot, false);
  img.src = DIR + (meta.file || `${String(slot).padStart(2, '0')}.png`);
  return wrap;
}
