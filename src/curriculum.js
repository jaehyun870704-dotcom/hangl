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

/**
 * 3단계 — 네 살이 아는 **두 글자** 낱말 100개.
 * 한 글자짜리는 2단계와 겹치고, 세 글자짜리는 네 살에게 너무 길다.
 */
const WORDS = [
  // 열매 · 채소
  ['사과', '🍎'], ['오이', '🥒'], ['포도', '🍇'], ['수박', '🍉'], ['딸기', '🍓'],
  ['참외', '🍈'], ['호박', '🎃'], ['감자', '🥔'], ['당근', '🥕'], ['배추', '🥬'],
  ['버섯', '🍄'], ['땅콩', '🥜'], ['가지', '🍆'], ['고추', '🌶️'], ['마늘', '🧄'],
  ['레몬', '🍋'], ['호두', '🌰'], ['자두', '🍑'], ['상추', '🥗'], ['미역', '🌿'],
  // 먹을 것
  ['우유', '🥛'], ['과자', '🍪'], ['사탕', '🍬'], ['김밥', '🍙'], ['라면', '🍜'],
  ['국수', '🍝'], ['만두', '🥟'], ['계란', '🥚'], ['두부', '🧈'], ['주스', '🧃'],
  // 입는 것 · 쓰는 것
  ['우산', '☂️'], ['모자', '🧢'], ['신발', '👟'], ['양말', '🧦'], ['바지', '👖'],
  ['치마', '👗'], ['가방', '🎒'], ['지갑', '👛'], ['안경', '👓'], ['장갑', '🧤'],
  ['장화', '👢'], ['열쇠', '🔑'], ['연필', '✏️'], ['가위', '✂️'], ['공책', '📓'],
  ['인형', '🧸'], ['풍선', '🎈'], ['블록', '🧱'],
  // 집 안
  ['의자', '🪑'], ['시계', '⏰'], ['거울', '🪞'], ['이불', '🛏️'], ['베개', '😴'],
  ['수건', '🧻'], ['비누', '🧼'], ['칫솔', '🪥'], ['접시', '🍽️'], ['냄비', '🍲'],
  ['그릇', '🥣'], ['수저', '🥄'],
  // 동물
  ['토끼', '🐰'], ['오리', '🦆'], ['돼지', '🐷'], ['사슴', '🦌'], ['여우', '🦊'],
  ['사자', '🦁'], ['기린', '🦒'], ['고래', '🐳'], ['문어', '🐙'], ['새우', '🦐'],
  ['개미', '🐜'], ['거미', '🕷️'], ['참새', '🐦'], ['하마', '🦛'], ['낙타', '🐫'],
  ['늑대', '🐺'], ['조개', '🐚'], ['상어', '🦈'], ['매미', '🦗'], ['나비', '🦋'],
  // 바깥
  ['바다', '🌊'], ['구름', '☁️'], ['나무', '🌳'], ['풀잎', '🍃'], ['바람', '🌬️'],
  ['하늘', '🌤️'], ['얼음', '🧊'], ['씨앗', '🌱'], ['호수', '🏞️'], ['바위', '🪨'],
  // 타는 것
  ['버스', '🚌'], ['기차', '🚆'], ['택시', '🚕'], ['트럭', '🚚'],
  // 사람
  ['엄마', '👩'], ['아빠', '👨'], ['누나', '👧'], ['동생', '🧒'], ['머리', '💇'],
  ['얼굴', '😊'],
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

// 낱말은 두 글자만. 획이 적은 것부터 — 네 살에게 획 스무 개짜리를 먼저 주면 안 된다
const stage3 = WORDS
  .filter(([w]) => [...w].length === 2)
  .map(([w, e], i) => buildText(`s3-${i}`, w, e))
  .filter(Boolean)
  .sort((a, b) => a.strokes.length - b.strokes.length);

/**
 * stickerPrefix / imagePrefix / filePrefix
 *   1단계는 빈 문자열이다. 이미 녹음해 둔 sticker-01 … sticker-10 이
 *   그대로 살아 있어야 하기 때문이다. 2·3단계만 s2- · s3- 를 붙인다.
 */
/**
 * shuffle — 순서 없이 섞어서 낼 것인가.
 * 1단계 자모는 ㄱ ㄴ ㄷ 순서 자체가 배울 거리라 그대로 간다.
 * 2·3단계를 순서대로 내면 «가나다라마바사» 를 노래처럼 외워 버려서
 * 글자를 읽는 것이 아니라 차례를 외우게 된다.
 */
export const STAGES = [
  {
    id: 'jamo', no: 1, name: '자모', short: 'ㄱㄴㄷ',
    hint: 'ㄱ ㄴ ㄷ 낱자 쓰기', items: stage1,
    stickers: 10, prefix: '', charBase: 0, shuffle: false,
  },
  {
    id: 'syllable', no: 2, name: '글자', short: '가나다',
    hint: '자음과 모음을 모아 쓰기', items: stage2,
    stickers: 10, prefix: 's2-', charBase: 10, shuffle: true,
  },
  {
    id: 'word', no: 3, name: '낱말', short: '사과',
    hint: '두 글자 낱말을 한 글자씩 쓰기', items: stage3,
    stickers: 10, prefix: 's3-', charBase: 20, shuffle: true,
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
