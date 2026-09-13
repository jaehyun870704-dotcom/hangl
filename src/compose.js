// ============================================================
// 자모를 모아 글자를 만든다 (가 = ㄱ + ㅏ)
//
// 자모 획 데이터는 저마다 0..1 상자 안에 그려져 있다.
// 그걸 글자 안의 제자리(초성 자리·중성 자리·종성 자리)로 옮겨 붙인다.
//
// 한글 모아쓰기 얼개
//   세로 모음(ㅏㅑㅓㅕㅣ) : 초성 왼쪽 · 중성 오른쪽
//   가로 모음(ㅗㅛㅜㅠㅡ) : 초성 위    · 중성 아래
//   받침이 있으면 위쪽을 눌러 담고 아래에 종성을 둔다
// ============================================================
import { JAMO_BY_ID } from './jamo.js';

/** 유니코드 한글 조합 순서 */
const CHO = ['g', 'gg', 'n', 'd', 'dd', 'r', 'm', 'b', 'bb', 's', 'ss', 'ng',
             'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe',
              'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = [null, 'g', 'gg', 'gs', 'n', 'nj', 'nh', 'd', 'r', 'rg', 'rm', 'rb',
              'rs', 'rt', 'rp', 'rh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch',
              'k', 't', 'p', 'h'];

/** 가로로 눕는 모음 — 초성이 위로 간다 */
const FLAT_VOWELS = new Set(['o', 'yo', 'u', 'yu', 'eu']);

/** 글자 하나를 자모로 쪼갠다. 모르는 글자면 null */
export function splitSyllable(ch) {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  const cho = CHO[Math.floor(code / 588)];
  const jung = JUNG[Math.floor((code % 588) / 28)];
  const jong = JONG[code % 28];
  return { cho, jung, jong };
}

/** 획 묶음이 차지하는 네모 */
function bbox(strokes) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const st of strokes) for (const [x, y] of st) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * 획 묶음을 주어진 칸에 맞춰 옮긴다.
 * ㅡ·ㅣ 처럼 한쪽이 납작한 것은 늘리지 않고 가운데에 둔다.
 */
function place(strokes, rect) {
  const b = bbox(strokes);
  const thinX = b.w < 0.03;
  const thinY = b.h < 0.03;
  const sx = thinX ? 1 : rect.w / b.w;
  const sy = thinY ? 1 : rect.h / b.h;
  const ox = thinX ? rect.x + rect.w / 2 : rect.x;
  const oy = thinY ? rect.y + rect.h / 2 : rect.y;
  return strokes.map((st) => st.map(([x, y]) => [
    thinX ? ox : ox + (x - b.x0) * sx,
    thinY ? oy : oy + (y - b.y0) * sy,
  ]));
}

/**
 * 겹모음·겹자음은 기본 24자를 붙여서 만든다.
 * ㅘ = ㅗ + ㅏ, ㅐ = ㅏ + ㅣ, ㄲ = ㄱ + ㄱ …
 */
const VOWEL_PARTS = {
  ae: ['a', 'i'], yae: ['ya', 'i'], e: ['eo', 'i'], ye: ['yeo', 'i'],
  oe: ['o', 'i'], wi: ['u', 'i'], ui: ['eu', 'i'],
  wa: ['o', 'a'], wae: ['o', 'ae'], wo: ['u', 'eo'], we: ['u', 'e'],
};
const CONS_PARTS = {
  gg: ['g', 'g'], dd: ['d', 'd'], bb: ['b', 'b'], ss: ['s', 's'], jj: ['j', 'j'],
  gs: ['g', 's'], nj: ['n', 'j'], nh: ['n', 'h'], rg: ['r', 'g'], rm: ['r', 'm'],
  rb: ['r', 'b'], rs: ['r', 's'], rt: ['r', 't'], rp: ['r', 'p'], rh: ['r', 'h'],
  bs: ['b', 's'],
};

/**
 * 가로 모음과 세로 모음이 함께 붙는 모음 — 글자 얼개가 셋으로 나뉜다.
 *   초성은 왼쪽 위, 가로 모음(ㅗ ㅜ ㅡ)은 그 아래, 세로 획(ㅏ ㅓ ㅣ)은 오른쪽 전체.
 *
 * ㅟ ㅚ ㅢ 를 빼먹으면 «위» 가 ㅇ 옆 좁은 칸에 ㅜ 와 ㅣ 를 욱여넣은 모양이 된다.
 * 한 글자가 아니라 낱자 셋을 늘어놓은 것처럼 보인다. (가위 · 참외 · 의자)
 */
const WIDE_VOWELS = new Set(['wa', 'wae', 'wo', 'we', 'wi', 'oe', 'ui']);

/** 자음 획 (겹자음이면 나란히 붙여서) */
function consonant(id) {
  const base = JAMO_BY_ID[id]?.strokes;
  if (base) return base;
  const parts = CONS_PARTS[id];
  if (!parts) return null;
  const a = consonant(parts[0]);
  const b = consonant(parts[1]);
  if (!a || !b) return null;
  return [
    ...place(a, { x: 0, y: 0, w: 0.47, h: 1 }),
    ...place(b, { x: 0.53, y: 0, w: 0.47, h: 1 }),
  ];
}

/** 모음 획 (겹모음이면 붙여서). ㅘ 무리는 글자 단계에서 따로 놓는다 */
function vowel(id) {
  const base = JAMO_BY_ID[id]?.strokes;
  if (base) return base;
  const parts = VOWEL_PARTS[id];
  if (!parts) return null;
  const a = vowel(parts[0]);
  const b = vowel(parts[1]);
  if (!a || !b) return null;
  if (FLAT_VOWELS.has(parts[0])) {
    // ㅘ ㅝ … : 아래에 ㅗ/ㅜ, 오른쪽에 ㅏ/ㅓ
    return [
      ...place(a, { x: 0, y: 0.55, w: 0.58, h: 0.45 }),
      ...place(b, { x: 0.62, y: 0, w: 0.38, h: 1 }),
    ];
  }
  // ㅐ ㅔ ㅚ … : 왼쪽 모음 + 오른쪽 ㅣ
  return [
    ...place(a, { x: 0, y: 0, w: 0.62, h: 1 }),
    ...place(b, { x: 0.72, y: 0, w: 0.28, h: 1 }),
  ];
}

const strokesOf = (id) => JAMO_BY_ID[id]?.strokes ?? null;

/**
 * 글자 하나의 획을 만든다.
 * @returns {Array|null} 획 묶음 (0..1 좌표) — 다룰 수 없는 글자면 null
 */
export function syllableStrokes(ch) {
  const parts = splitSyllable(ch);
  if (!parts) return null;
  const cho = consonant(parts.cho);
  const jung = vowel(parts.jung);
  if (!cho || !jung) return null;
  const jong = parts.jong ? consonant(parts.jong) : null;
  if (parts.jong && !jong) return null;

  const bottom = jong ? 0.66 : 0.96;              // 받침이 있으면 위를 눌러 담는다
  const out = [];

  if (WIDE_VOWELS.has(parts.jung)) {
    // ㅘ ㅝ … : 초성은 왼쪽 위, 모음은 아래와 오른쪽을 함께 쓴다
    out.push(...place(cho,  { x: 0.06, y: 0.06, w: 0.42, h: bottom * 0.48 }));
    out.push(...place(jung, { x: 0.04, y: 0.06, w: 0.90, h: bottom - 0.10 }));
  } else if (FLAT_VOWELS.has(parts.jung)) {
    // ㅗ ㅜ ㅡ … : 초성 위, 중성 아래
    const mid = bottom * 0.62;
    out.push(...place(cho,  { x: 0.22, y: 0.06, w: 0.56, h: mid - 0.12 }));
    out.push(...place(jung, { x: 0.06, y: mid,  w: 0.88, h: bottom - mid - 0.04 }));
  } else {
    // ㅏ ㅓ ㅣ … : 초성 왼쪽, 중성 오른쪽
    const vw = VOWEL_PARTS[parts.jung] ? 0.40 : 0.34;   // ㅐ ㅔ 는 조금 넓게
    out.push(...place(cho,  { x: 0.06, y: 0.08, w: 0.92 - vw - 0.12, h: bottom - 0.16 }));
    out.push(...place(jung, { x: 0.94 - vw, y: 0.04, w: vw, h: bottom - 0.08 }));
  }
  if (jong) out.push(...place(jong, { x: 0.18, y: 0.70, w: 0.64, h: 0.26 }));
  return out;
}

/**
 * 낱말 하나의 획을 만든다. 글자를 가로로 나란히 놓는다.
 * @returns {{strokes:Array, scale:number}|null} scale 은 글자가 작아진 비율
 */
export function wordStrokes(word) {
  const chars = [...word];
  const n = chars.length;
  const gap = 0.02;
  const w = (1 - gap * (n - 1)) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const st = syllableStrokes(chars[i]);
    if (!st) return null;
    const x = i * (w + gap);
    out.push(...st.map((s) => s.map(([px, py]) => [x + px * w, py])));
  }
  return { strokes: out, scale: w };
}

/** 글자든 낱말이든 알아서 (한 글자면 그대로, 여러 글자면 나란히) */
export function textStrokes(text) {
  const chars = [...text];
  if (chars.length === 1) {
    const st = syllableStrokes(chars[0]);
    return st ? { strokes: st, scale: 1 } : null;
  }
  return wordStrokes(text);
}
