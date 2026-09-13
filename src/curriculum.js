// ============================================================
// 배울 거리 — 세 단계
//   1단계 자모   : ㄱ ㄴ ㄷ … ㅣ           (24)
//   2단계 글자   : 가 나 다 … 히            (28)
//   3단계 낱말   : 사과 오이 나비 …        (100)
//
// 단계마다 진도와 스티커가 따로 간다.
//
// 한 항목은 이렇게 생겼다.
//   { id, text, label, word, emoji, parts: [{ text, strokes }], strokes }
//
// parts 가 핵심이다. «사과» 는 한 번에 쓰지 않고 «사» 를 쓰고 «과» 를 쓴다.
// 네 살에게 18획짜리 «다람쥐» 를 한 화면에 놓으면 글자가 너무 작아진다.
// 그래서 한 글자씩 크게 쓰고, 위에는 낱말 전체를 보여 준다.
// 1·2단계는 parts 가 하나뿐이라 셋이 똑같은 방식으로 돈다.
// ============================================================
import { JAMO } from './jamo.js';
import { syllableStrokes } from './compose.js';

/** 2단계 — 가나다 줄과 기니디 줄 */
const SYLLABLES = [
  ...['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'],
  ...['기', '니', '디', '리', '미', '비', '시', '이', '지', '치', '키', '티', '피', '히'],
];

/** 3단계 — 네 살이 아는 낱말 100개 */
const WORDS = [
  ['사과', '🍎'], ['오이', '🥒'], ['나비', '🦋'], ['바다', '🌊'], ['구름', '☁️'],
  ['포도', '🍇'], ['토끼', '🐰'], ['우유', '🥛'], ['바나나', '🍌'], ['수박', '🍉'],
  ['딸기', '🍓'], ['참외', '🍈'], ['호박', '🎃'], ['감자', '🥔'], ['고구마', '🍠'],
  ['당근', '🥕'], ['배추', '🥬'], ['버섯', '🍄'], ['옥수수', '🌽'], ['땅콩', '🥜'],
  ['빵', '🍞'], ['과자', '🍪'], ['사탕', '🍬'], ['우산', '☂️'], ['모자', '🧢'],
  ['신발', '👟'], ['양말', '🧦'], ['바지', '👖'], ['치마', '👗'], ['가방', '🎒'],
  ['연필', '✏️'], ['가위', '✂️'], ['풀', '🌱'], ['공책', '📓'], ['지우개', '🧽'],
  ['책상', '🪑'], ['의자', '🪑'], ['시계', '⏰'], ['거울', '🪞'], ['이불', '🛏️'],
  ['베개', '🛏️'], ['수건', '🧻'], ['비누', '🧼'], ['칫솔', '🪥'], ['컵', '🥤'],
  ['숟가락', '🥄'], ['젓가락', '🥢'], ['접시', '🍽️'], ['냄비', '🍲'], ['주전자', '🫖'],
  ['강아지', '🐶'], ['고양이', '🐱'], ['병아리', '🐥'], ['오리', '🦆'], ['돼지', '🐷'],
  ['소', '🐮'], ['말', '🐴'], ['양', '🐑'], ['사슴', '🦌'], ['여우', '🦊'],
  ['곰', '🐻'], ['호랑이', '🐯'], ['사자', '🦁'], ['코끼리', '🐘'], ['기린', '🦒'],
  ['원숭이', '🐵'], ['다람쥐', '🐿️'], ['거북이', '🐢'], ['개구리', '🐸'], ['뱀', '🐍'],
  ['물고기', '🐟'], ['고래', '🐳'], ['문어', '🐙'], ['게', '🦀'], ['새우', '🦐'],
  ['벌', '🐝'], ['개미', '🐜'], ['거미', '🕷️'], ['달팽이', '🐌'], ['잠자리', '🪰'],
  ['꽃', '🌸'], ['나무', '🌳'], ['풀잎', '🍃'], ['해', '☀️'], ['달', '🌙'],
  ['별', '⭐'], ['비', '🌧️'], ['눈', '❄️'], ['바람', '🌬️'], ['무지개', '🌈'],
  ['산', '⛰️'], ['강', '🏞️'], ['하늘', '🌤️'], ['불', '🔥'], ['돌', '🪨'],
  ['자동차', '🚗'], ['버스', '🚌'], ['기차', '🚆'], ['비행기', '✈️'], ['자전거', '🚲'],
];

/**
 * 글자를 하나씩 떼어 항목을 만든다.
 * 획을 못 만드는 글자가 하나라도 있으면 그 낱말은 통째로 뺀다.
 */
function buildText(id, text, emoji) {
  const parts = [];
  for (const ch of text) {
    const strokes = syllableStrokes(ch);
    if (!strokes) return null;
    parts.push({ text: ch, strokes });
  }
  return {
    id, text, label: text, word: text, emoji,
    parts,
    strokes: parts.flatMap((p) => p.strokes),   // 획 수를 셀 때만 쓴다
  };
}

const stage1 = JAMO.map((j) => ({
  id: j.id, text: j.ch, label: j.ch, name: j.name,
  word: j.word, emoji: j.emoji,
  parts: [{ text: j.ch, strokes: j.strokes }],
  strokes: j.strokes,
}));

const stage2 = SYLLABLES.map((ch, i) => buildText(`s2-${i}`, ch, null)).filter(Boolean);

// 낱말은 획이 적은 것부터 — 네 살에게 «다람쥐»(18획)를 먼저 주면 안 된다
const stage3 = WORDS
  .map(([w, e], i) => buildText(`s3-${i}`, w, e))
  .filter(Boolean)
  .sort((a, b) => a.strokes.length - b.strokes.length || a.parts.length - b.parts.length);

/**
 * stickerPrefix / imagePrefix / filePrefix
 *   1단계는 빈 문자열이다. 이미 녹음해 둔 sticker-01 … sticker-10 이
 *   그대로 살아 있어야 하기 때문이다. 2·3단계만 s2- · s3- 를 붙인다.
 */
export const STAGES = [
  {
    id: 'jamo', no: 1, name: '자모', short: 'ㄱㄴㄷ',
    hint: 'ㄱ ㄴ ㄷ 낱자 쓰기', items: stage1,
    stickers: 10, prefix: '', charBase: 0,
  },
  {
    id: 'syllable', no: 2, name: '글자', short: '가나다',
    hint: '자음과 모음을 모아 쓰기', items: stage2,
    stickers: 10, prefix: 's2-', charBase: 10,
  },
  {
    id: 'word', no: 3, name: '낱말', short: '사과',
    hint: '낱말을 한 글자씩 쓰기', items: stage3,
    stickers: 10, prefix: 's3-', charBase: 20,
  },
];

export const STAGE_IDS = STAGES.map((s) => s.id);
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const stageOf = (id) => STAGE_BY_ID[id] ?? STAGES[0];
export const DEFAULT_STAGE = STAGES[0].id;

/** 단계 안에서 항목을 id 로 찾는다 */
export function itemOf(stageId, itemId) {
  return stageOf(stageId).items.find((it) => it.id === itemId) ?? null;
}

/** 단계 안에서 항목의 순번 */
export function indexOf(stageId, itemId) {
  return stageOf(stageId).items.findIndex((it) => it.id === itemId);
}

/** 이 항목을 소리 내어 읽을 때 쓰는 음성 키. 1단계만 녹음해 둔 것이 있다 */
export function itemVoiceKey(stageId, item) {
  return stageId === 'jamo' ? `jamo-${item.id}` : null;
}

/** 이 항목을 읽을 말 (녹음이 없으면 이 글로 읽는다) */
export function itemSpeech(stageId, item) {
  return stageId === 'jamo' ? (item.name ?? item.text) : item.text;
}
