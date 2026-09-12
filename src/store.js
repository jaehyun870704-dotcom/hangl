// ============================================================
// 로컬 저장소 — 기기 밖으로 나가는 데이터 없음 (PRD 8)
// ============================================================
import { JAMO } from './jamo.js';
import { stickerCount } from './stickers.js';

const KEY = 'hangul-trace.v1';

const defaults = () => ({
  version: 1,
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
    cursor: 0,                 // 커리큘럼 진행 위치 (JAMO 인덱스)
    sessionSize: 3,            // PRD 4.3 초기 세션 크기
    sinceSizeChange: 0,        // 크기 변경 후 누적 세션 수
    weak: [],                  // 다시 만날 글자 id 목록
    stickers: [],              // 획득한 스티커 슬롯 번호 (1..캐릭터 수)
    stats: {},                 // jamoId -> { attempts, passes, accSum, best, last, lastSeen }
  },
  sessions: [],                // 최근 기록 (최신이 앞)
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

let data = defaults();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = deepMerge(defaults(), JSON.parse(raw));
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
  get progress() { return data.progress; },
  get sessions() { return data.sessions; },
};

export function resetProgress() {
  const keepSettings = data.settings;
  const keepName = data.profile.name;
  data = defaults();
  data.settings = keepSettings;
  data.profile.name = keepName;
  save();
}

export function updateSettings(patch) {
  Object.assign(data.settings, patch);
  save();
}

/** 글자 1자에 대한 시도 결과 기록 */
export function recordLetter(jamoId, accuracy, passed) {
  const s = data.progress.stats[jamoId] || { attempts: 0, passes: 0, accSum: 0, best: 0, last: 0, lastSeen: 0 };
  s.attempts += 1;
  if (passed) s.passes += 1;
  s.accSum += accuracy;
  s.best = Math.max(s.best, accuracy);
  s.last = accuracy;
  s.lastSeen = Date.now();
  data.progress.stats[jamoId] = s;
}

/** 세션 종료 기록 + 다음 세션 크기 결정 (PRD 4.4) */
export function finishSession(record) {
  data.sessions.unshift(record);
  if (data.sessions.length > 90) data.sessions.length = 90;

  const st = data.settings;
  const p = data.progress;

  if (st.sessionSizeMode === 'auto') {
    // 같은 3세션으로 연속 확장되지 않도록, 크기를 바꾼 뒤에는 판정 창만큼 새 세션을 모은다
    p.sinceSizeChange = (p.sinceSizeChange ?? 0) + 1;
    const win = data.sessions.slice(0, st.judgeWindow).filter((s) => s.completed);
    if (win.length >= st.judgeWindow && p.sinceSizeChange >= st.judgeWindow) {
      const avg = win.reduce((a, s) => a + s.avgAccuracy, 0) / win.length;
      const before = p.sessionSize;
      if (avg >= st.expandThreshold) p.sessionSize = Math.min(st.maxSessionSize, p.sessionSize + 1);
      else if (avg < st.holdThreshold) p.sessionSize = Math.max(2, p.sessionSize - 1);
      if (p.sessionSize !== before) p.sinceSizeChange = 0;
    }
  } else {
    p.sessionSize = Number(st.sessionSizeMode);
  }
  save();
}

/** 세션 결과를 진도에 반영 — 통과한 글자는 빼고, 못 통과한 글자는 다시 만날 목록에 담는다 */
export function applySessionOutcome({ letters, passed, nextCursor }) {
  const p = data.progress;
  const passedSet = new Set(passed);
  for (const id of letters) {
    const i = p.weak.indexOf(id);
    if (passedSet.has(id)) { if (i >= 0) p.weak.splice(i, 1); }
    else if (i < 0) p.weak.push(id);
  }
  p.cursor = nextCursor % JAMO.length;
  save();
}

/** 커리큘럼만 첫 글자로 되돌린다 (스티커·기록·설정은 그대로) */
export function restartCurriculum() {
  data.progress.cursor = 0;
  data.progress.weak = [];
  save();
}

export function grantSticker() {
  const p = data.progress;
  const total = stickerCount();
  const next = p.stickers.length + 1;      // 중복 없음, 순서대로 (PRD 6.1)
  if (next <= total) p.stickers.push(next);  // 다 모은 뒤에는 스티커북을 그대로 둔다
  save();
  return next <= total ? next : null;
}

/** 오늘 완료한 세션 수 */
export function todaySessionCount() {
  const today = dayKey(Date.now());
  return data.sessions.filter((s) => dayKey(s.finishedAt) === today && s.completed).length;
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 취약 자모 상위 N — 평균 정확도가 통과 기준선에 못 미치는 글자만 (PRD 7 부모 메뉴) */
export function weakestLetters(n = 5) {
  const th = data.settings.passThreshold;
  const rows = Object.entries(data.progress.stats)
    .filter(([, s]) => s.attempts > 0 && s.accSum / s.attempts < th)
    .map(([id, s]) => ({ id, avg: s.accSum / s.attempts, attempts: s.attempts }))
    .sort((a, b) => a.avg - b.avg);
  return rows.slice(0, n);
}

/** 1회 이상 통과한 자모 = 완료로 표시 */
export function completedLetters() {
  return JAMO.filter((j) => (data.progress.stats[j.id]?.passes ?? 0) > 0).map((j) => j.id);
}
