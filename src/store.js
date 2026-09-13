// ============================================================
// 로컬 저장소 — 기기 밖으로 나가는 데이터 없음 (PRD 8)
//
// 진도는 단계마다 따로 간다.
//   progress.stage            지금 하고 있는 단계
//   progress.stages[단계id]   그 단계의 진도 (커서·스티커·기록·세션 크기)
//
// 단계가 생기기 전의 기록은 불러올 때 자동으로 «백업1» 로 떠 두고
// 1단계 자리로 옮긴다. 언제든 되돌릴 수 있다.
// ============================================================
import { STAGES, stageOf, DEFAULT_STAGE } from './curriculum.js';
import { stickerCount, setNameOverrides, setActiveStage, nameKey } from './stickers.js';

const KEY = 'hangul-trace.v1';

/** 단계 한 칸의 빈 진도 */
const emptyStage = () => ({
  cursor: 0,                 // 커리큘럼 진행 위치
  sessionSize: 3,            // PRD 4.3 초기 세션 크기
  sinceSizeChange: 0,        // 크기 변경 후 누적 세션 수
  finishedAt: 0,             // 이 단계를 처음 다 뗀 시각
  weak: [],                  // 다시 만날 항목 id 목록
  stickers: [],              // 획득한 스티커 슬롯 번호 (1..10)
  stats: {},                 // itemId -> { attempts, passes, accSum, best, last, lastSeen }
});

const defaults = () => ({
  version: 2,
  profile: { name: '', createdAt: Date.now() },
  settings: {
    sessionSizeMode: 'auto',   // 'auto' | 2..6
    expandThreshold: 0.70,     // PRD 4.4 확장 기준선 ★제안
    holdThreshold: 0.45,       // PRD 4.4 유지 기준선 ★제안
    passThreshold: 0.60,       // PRD 5.2 글자 통과 기준 ★제안
    judgeWindow: 3,            // PRD 4.4 판정 창
    maxSessionSize: 6,         // PRD 4.3 최대 세션 크기 ★제안
    band: 0.12,                // PRD 5.2 점선 밴드 폭
    startR: 0.15,              // PRD 5.2 시작점 반경
    volume: 0.85,
    dailyLimit: 0,             // 0 = 제한 없음 (PRD 9.1 기본값)
    onlyRecordedVoice: false,  // true = 녹음된 목소리만 재생 (기계음 TTS 사용 안 함)
    sfxPreset: {},             // 효과음 슬롯별 기본 소리 번호
  },
  progress: {
    stage: DEFAULT_STAGE,
    stages: Object.fromEntries(STAGES.map((s) => [s.id, emptyStage()])),
  },
  characters: {},              // 부모가 바꾼 친구 이름 { '단계:슬롯': { name, trait } }
  voiceLabels: {},             // 녹음할 때의 문구 { 음성키: '그때 읽은 말' }
  sessions: [],                // 최근 기록 (최신이 앞)
  backups: [],                 // [{ id, name, at, note, data }]
});

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? patch.slice?.() ?? base : { ...base };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * 단계가 없던 시절의 저장본을 새 모양으로 옮긴다.
 * 옮기기 전 모습을 «백업1» 로 떠 둔다 — 언제든 그때로 돌아갈 수 있게.
 */
let migrated = false;

function migrate(raw) {
  const p = raw.progress;
  if (!p || p.stages) return raw;
  migrated = true;

  const before = clone({ ...raw, backups: [] });
  raw.backups = Array.isArray(raw.backups) ? raw.backups : [];
  raw.backups.unshift({
    id: `b${Date.now()}`,
    name: '백업1',
    at: Date.now(),
    note: '단계가 생기기 전의 기록입니다',
    data: before,
  });

  const jamo = {
    ...emptyStage(),
    cursor: p.cursor ?? 0,
    sessionSize: p.sessionSize ?? 3,
    sinceSizeChange: p.sinceSizeChange ?? 0,
    finishedAt: p.finishedAt ?? 0,
    weak: Array.isArray(p.weak) ? p.weak : [],
    stickers: Array.isArray(p.stickers) ? p.stickers : [],
    stats: p.stats && typeof p.stats === 'object' ? p.stats : {},
  };
  raw.progress = {
    stage: DEFAULT_STAGE,
    stages: { ...Object.fromEntries(STAGES.map((s) => [s.id, emptyStage()])), jamo },
  };
  // 옛 세션 기록은 모두 1단계 것이다
  if (Array.isArray(raw.sessions)) raw.sessions.forEach((s) => { s.stage = s.stage ?? 'jamo'; });
  raw.version = 2;
  return raw;
}

let data = defaults();

export function load() {
  try {
    const rawText = localStorage.getItem(KEY);
    if (rawText) data = deepMerge(defaults(), migrate(JSON.parse(rawText)));
    // 단계가 늘어난 경우를 대비해 빠진 칸을 채운다
    for (const s of STAGES) {
      if (!data.progress.stages[s.id]) data.progress.stages[s.id] = emptyStage();
    }
    if (!stageOf(data.progress.stage) || !data.progress.stages[data.progress.stage]) {
      data.progress.stage = DEFAULT_STAGE;
    }
    setNameOverrides(data.characters);
    setActiveStage(data.progress.stage);
    // 옮긴 결과와 «백업1» 을 바로 적어 둔다. 아무것도 안 하고 닫아도 남게
    if (migrated) { migrated = false; save(); }
  } catch (e) {
    console.warn('저장된 데이터를 읽지 못해 새로 시작합니다.', e);
    data = defaults();
  }
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('저장 실패', e);
  }
}

export const state = {
  get data() { return data; },
  get settings() { return data.settings; },
  /** 지금 단계의 진도 — 화면들이 쓰는 것은 거의 다 이것이다 */
  get progress() { return data.progress.stages[data.progress.stage]; },
  /** 단계 전체 (stage · stages) */
  get all() { return data.progress; },
  get stage() { return stageOf(data.progress.stage); },
  get sessions() { return data.sessions; },
};

/** 지금 단계의 배울 거리 목록 */
const items = () => state.stage.items;

/** 단계를 바꾼다 */
export function setStage(id) {
  const s = stageOf(id);
  data.progress.stage = s.id;
  setActiveStage(s.id);
  save();
  return s;
}

export function resetProgress() {
  const keepSettings = data.settings;
  const keepName = data.profile.name;
  const keepBackups = data.backups;
  const keepChars = data.characters;
  data = defaults();
  data.settings = keepSettings;
  data.profile.name = keepName;
  data.backups = keepBackups;
  data.characters = keepChars;
  setActiveStage(data.progress.stage);
  save();
}

/** 이 단계의 진도만 지운다 */
export function resetStage(id = data.progress.stage) {
  data.progress.stages[stageOf(id).id] = emptyStage();
  save();
}

// ── 백업 ────────────────────────────────────────────────
export const listBackups = () => data.backups.slice();

/** 지금 상태를 백업으로 떠 둔다 */
export function createBackup(name) {
  const n = (name || '').trim() || `백업${data.backups.length + 1}`;
  data.backups.unshift({
    id: `b${Date.now()}`,
    name: n,
    at: Date.now(),
    note: '',
    data: clone({ ...data, backups: [] }),
  });
  if (data.backups.length > 20) data.backups.length = 20;
  save();
  return n;
}

/**
 * 백업으로 되돌린다.
 * 되돌리기 직전의 모습도 한 장 떠 두기 때문에 잘못 눌러도 다시 돌아올 수 있다.
 */
export function restoreBackup(id) {
  const hit = data.backups.find((b) => b.id === id);
  if (!hit) return false;
  const keep = data.backups.slice();
  keep.unshift({
    id: `b${Date.now()}`,
    name: '되돌리기 직전',
    at: Date.now(),
    note: `«${hit.name}» 으로 되돌리기 전의 모습`,
    data: clone({ ...data, backups: [] }),
  });
  data = deepMerge(defaults(), migrate(clone(hit.data)));
  for (const s of STAGES) {
    if (!data.progress.stages[s.id]) data.progress.stages[s.id] = emptyStage();
  }
  data.backups = keep.slice(0, 20);
  setNameOverrides(data.characters);
  setActiveStage(data.progress.stage);
  save();
  return true;
}

export function deleteBackup(id) {
  const i = data.backups.findIndex((b) => b.id === id);
  if (i >= 0) { data.backups.splice(i, 1); save(); }
}

/** 친구 이름 바꾸기. 빈 값이면 원래 이름으로 되돌린다 */
export function setCharacterName(slot, text, stage) {
  const k = nameKey(slot, stage ?? data.progress.stage);
  const t = (text || '').trim();
  if (t) data.characters[k] = { name: t, trait: '' };
  else delete data.characters[k];
  setNameOverrides(data.characters);
  save();
}

/** 이 음성을 녹음할 때 읽은 문구를 적어 둔다 (이름이 바뀌면 알려주려고) */
export function rememberVoiceLabel(key, label) {
  data.voiceLabels[key] = label;
  save();
}

export function updateSettings(patch) {
  Object.assign(data.settings, patch);
  save();
}

/** 항목 1개에 대한 시도 결과 기록 */
export function recordLetter(itemId, accuracy, passed) {
  const st = state.progress.stats;
  const s = st[itemId] || { attempts: 0, passes: 0, accSum: 0, best: 0, last: 0, lastSeen: 0 };
  s.attempts += 1;
  if (passed) s.passes += 1;
  s.accSum += accuracy;
  s.best = Math.max(s.best, accuracy);
  s.last = accuracy;
  s.lastSeen = Date.now();
  st[itemId] = s;
}

/** 세션 종료 기록 + 다음 세션 크기 결정 (PRD 4.4) */
export function finishSession(record) {
  const stage = data.progress.stage;
  data.sessions.unshift({ ...record, stage });
  if (data.sessions.length > 120) data.sessions.length = 120;

  const cfg = data.settings;
  const p = state.progress;

  if (cfg.sessionSizeMode === 'auto') {
    // 같은 3세션으로 연속 확장되지 않도록, 크기를 바꾼 뒤에는 판정 창만큼 새 세션을 모은다
    p.sinceSizeChange = (p.sinceSizeChange ?? 0) + 1;
    const win = data.sessions.filter((s) => s.stage === stage).slice(0, cfg.judgeWindow)
      .filter((s) => s.completed);
    if (win.length >= cfg.judgeWindow && p.sinceSizeChange >= cfg.judgeWindow) {
      const avg = win.reduce((a, s) => a + s.avgAccuracy, 0) / win.length;
      const before = p.sessionSize;
      if (avg >= cfg.expandThreshold) p.sessionSize = Math.min(cfg.maxSessionSize, p.sessionSize + 1);
      else if (avg < cfg.holdThreshold) p.sessionSize = Math.max(2, p.sessionSize - 1);
      if (p.sessionSize !== before) p.sinceSizeChange = 0;
    }
  } else {
    p.sessionSize = Number(cfg.sessionSizeMode);
  }
  save();
}

/** 세션 결과를 진도에 반영 — 통과한 것은 빼고, 못 통과한 것은 다시 만날 목록에 담는다 */
export function applySessionOutcome({ letters, passed, nextCursor }) {
  const p = state.progress;
  const passedSet = new Set(passed);
  for (const id of letters) {
    const i = p.weak.indexOf(id);
    if (passedSet.has(id)) { if (i >= 0) p.weak.splice(i, 1); }
    else if (i < 0) p.weak.push(id);
  }
  p.cursor = nextCursor % items().length;
  save();
}

/** 고른 글자부터 시작하도록 진도 위치를 옮긴다 */
export function startFromLetter(index) {
  state.progress.cursor = Math.max(0, Math.min(items().length - 1, index));
  save();
}

/** 이 단계를 첫 항목으로 되돌린다 (스티커·기록·설정은 그대로) */
export function restartCurriculum() {
  const p = state.progress;
  p.cursor = 0;
  p.weak = [];
  save();
}

/**
 * 스티커를 준다. 진도에 맞춰 나눠 주기 때문에
 * 그 단계의 마지막 항목을 떼는 순간 스티커북이 정확히 다 찬다.
 *
 * 세션마다 꼭 한 장씩 주지는 않는다. 3단계는 낱말이 100개인데 친구는 10명이라,
 * 한 세션에 한 장씩 주면 마흔 번째 낱말쯤에 다 모아 버리고 나머지 예순 낱말은
 * 줄 것이 없어진다. 새 친구가 없는 날에는 이미 만난 친구가 나와서 축하해 준다
 * (reward.js) — 보상이 없는 세션은 없다 (PRD 6.1).
 * 다만 맨 처음 한 장은 무조건 준다. 첫 세션을 빈손으로 끝내지 않도록.
 */
export function grantSticker() {
  const p = state.progress;
  const total = stickerCount();
  if (p.stickers.length >= total) { save(); return null; }   // 이미 다 모았다

  const all = items().length;
  const passed = completedLetters().length;
  // 내림으로 센다 — 그래야 마지막 한 장이 그 단계의 마지막 항목에 정확히 걸린다
  const target = passed >= all ? total : Math.min(total, Math.floor((passed / all) * total));

  const give = Math.max(p.stickers.length === 0 ? 1 : 0, target - p.stickers.length);
  if (give <= 0) { save(); return null; }
  let last = null;
  for (let i = 0; i < give && p.stickers.length < total; i++) {
    p.stickers.push(p.stickers.length + 1);
    last = p.stickers.length;
  }
  save();
  return last;
}

/** 이 단계의 항목을 모두 한 번씩 떼었는가 */
export const isCurriculumDone = () => completedLetters().length >= items().length;

/** 완주를 처음 달성한 순간이면 true 를 돌려주고 기록해 둔다 */
export function markFinishedOnce() {
  const p = state.progress;
  if (!isCurriculumDone() || p.finishedAt) return false;
  p.finishedAt = Date.now();
  save();
  return true;
}

/** 오늘 완료한 세션 수 (단계를 가리지 않는다 — 하루 상한은 아이 기준이다) */
export function todaySessionCount() {
  const today = dayKey(Date.now());
  return data.sessions.filter((s) => dayKey(s.finishedAt) === today && s.completed).length;
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 취약 항목 상위 N — 평균 정확도가 통과 기준선에 못 미치는 것만 (PRD 7 부모 메뉴) */
export function weakestLetters(n = 5, stage) {
  const th = data.settings.passThreshold;
  const p = data.progress.stages[stageOf(stage ?? data.progress.stage).id];
  const rows = Object.entries(p.stats)
    .filter(([, s]) => s.attempts > 0 && s.accSum / s.attempts < th)
    .map(([id, s]) => ({ id, avg: s.accSum / s.attempts, attempts: s.attempts }))
    .sort((a, b) => a.avg - b.avg);
  return rows.slice(0, n);
}

/** 1회 이상 통과한 항목 = 완료로 표시 */
export function completedLetters(stage) {
  const s = stageOf(stage ?? data.progress.stage);
  const p = data.progress.stages[s.id];
  return s.items.filter((it) => (p.stats[it.id]?.passes ?? 0) > 0).map((it) => it.id);
}
