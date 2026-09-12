// ============================================================
// 학습 세션 진행 (PRD 4.3 / 4.4 / 5.3)
//  - 아이는 어떤 경우에도 세션을 완주한다
//  - 실패는 "다시 만나는 글자"로만 반영된다
// ============================================================
import { JAMO, JAMO_INDEX } from './jamo.js';
import { state, recordLetter, finishSession, grantSticker, applySessionOutcome, save } from './store.js';
import { createTracer } from './trace.js';
import { say, sfx, stopVoice } from './audio.js';

/** 이번 세션에 배정할 글자 목록 */
export function composeSession({ skipWeak = false } = {}) {
  const p = state.progress;
  const size = Math.max(2, Math.min(state.settings.maxSessionSize, p.sessionSize));
  const letters = [];

  // 다시 만나야 할 글자를 먼저 (새 글자 진도가 멈추지 않도록 최대 1/3)
  // 아이가 글자를 직접 골랐을 때는 고른 글자가 맨 앞에 와야 하므로 건너뛴다
  const weakQuota = Math.max(1, Math.floor(size / 3));
  if (!skipWeak) {
    for (const id of p.weak.slice(0, weakQuota)) {
      if (letters.length < size - 1) letters.push(id);
    }
  }

  // 커리큘럼 순서대로 새 글자 채우기 (24자를 다 돌면 처음부터 반복)
  let cursor = p.cursor;
  let guard = 0;
  while (letters.length < size && guard++ < 100) {
    const j = JAMO[cursor % JAMO.length];
    if (!letters.includes(j.id)) letters.push(j.id);
    cursor += 1;
  }
  return { letters, nextCursor: cursor };
}

export function createSessionScreen(deps) {
  const { canvas, dotsEl, fxEl, demoBtn, escapeBtn, onFinished, onExit } = deps;

  let tracer = null;
  let letters = [];
  let nextCursor = 0;
  let idx = 0;
  let attempt = 1;
  let retryRound = false;
  let retryList = [];
  let bestAcc = {};      // jamoId -> 이번 세션 최고 정확도
  let passedSet = new Set();
  let seenInSession = new Set();
  let startedAt = 0;
  let active = false;
  let busy = false;

  function ensureTracer() {
    if (tracer) return tracer;
    tracer = createTracer(canvas, {
      onStroke: (i, r) => { if (r.score >= 0.5) sfx.stroke(); else sfx.tap(); },
      onComplete: (acc) => onCharComplete(acc),
      onTap: () => { const j = currentJamo(); if (j) say(`jamo-${j.id}`); },
    });
    return tracer;
  }

  const currentJamo = () => {
    const id = retryRound ? retryList[idx] : letters[idx];
    return id ? JAMO[JAMO_INDEX[id]] : null;
  };

  // ── 진행 표시 (점 아이콘, 숫자 없음 — PRD 7) ──────────────
  function renderDots() {
    dotsEl.innerHTML = '';
    const total = retryRound ? retryList.length : letters.length;
    for (let i = 0; i < total; i++) {
      const d = document.createElement('i');
      if (retryRound) d.classList.add('retry');
      if (i < idx) d.classList.add('done');
      else if (i === idx) d.classList.add('now');
      dotsEl.appendChild(d);
    }
  }

  // ── 연출 ────────────────────────────────────────────────
  function sparkle(strong) {
    const c = tracer.center();
    const n = strong ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const dis = c.size * (0.32 + Math.random() * 0.3);
      s.style.left = `${c.x}px`;
      s.style.top = `${c.y}px`;
      s.style.background = ['#FFD86B', '#FF9DBB', '#8FD9C4', '#B4A6F0'][i % 4];
      s.style.setProperty('--dx', `${Math.cos(ang) * dis}px`);
      s.style.setProperty('--dy', `${Math.sin(ang) * dis}px`);
      fxEl.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
    if (strong) {
      const e = document.createElement('div');
      e.className = 'cheer';
      e.textContent = ['🎉', '⭐', '👏', '✨'][Math.floor(Math.random() * 4)];
      fxEl.appendChild(e);
      setTimeout(() => e.remove(), 1250);
    }
  }

  // ── 글자 표시 ───────────────────────────────────────────
  function showLetter() {
    const j = currentJamo();
    if (!j) return;
    busy = false;
    renderDots();

    const st = state.settings;
    const firstSight = !seenInSession.has(j.id);
    tracer.setChar(j, {
      band: st.band,
      startR: st.startR,
      guideScale: attempt > 1 ? 1.3 : 1,   // 재시도 시 점선을 굵게 (PRD 5.4)
    });
    tracer.enable(false);

    say(`jamo-${j.id}`);                  // 등장 시 1회 자동 재생 (PRD 4.2)

    const needDemo = firstSight || attempt > 1;
    seenInSession.add(j.id);
    if (needDemo) {
      setTimeout(() => {
        if (!active) return;
        tracer.playDemo(() => tracer.enable(true));
      }, 650);
    } else {
      tracer.enable(true);
    }
  }

  // ── 글자 1자 완료 ───────────────────────────────────────
  function onCharComplete(acc) {
    if (busy) return;
    busy = true;
    tracer.enable(false);

    const j = currentJamo();
    const pass = acc >= state.settings.passThreshold;
    bestAcc[j.id] = Math.max(bestAcc[j.id] ?? 0, acc);
    recordLetter(j.id, acc, pass);
    if (pass) passedSet.add(j.id);

    if (retryRound) {
      // 재도전 라운드는 결과와 무관하게 통과 처리 (PRD 5.3)
      sfx.charPass(); sparkle(true); say('good');
      setTimeout(next, 1200);
      return;
    }

    if (pass) {
      sfx.charPass(); sparkle(true); say('good');
      setTimeout(next, 1200);
    } else if (attempt === 1) {
      sfx.soft();
      say('try-again');                      // 부정 표현 금지 (PRD 5.4)
      attempt = 2;
      setTimeout(() => { if (active) showLetter(); }, 1100);
    } else {
      sfx.charPass(); sparkle(false);
      say('good');
      if (!retryList.includes(j.id)) retryList.push(j.id);
      setTimeout(next, 1200);
    }
  }

  function next() {
    if (!active) return;
    attempt = 1;
    idx += 1;
    const total = retryRound ? retryList.length : letters.length;
    if (idx < total) { showLetter(); return; }

    if (!retryRound && retryList.length) {
      retryRound = true;
      idx = 0;
      showLetter();
      return;
    }
    complete();
  }

  // ── 세션 완료 ───────────────────────────────────────────
  function complete() {
    active = false;
    tracer.enable(false);
    applySessionOutcome({ letters, passed: [...passedSet], nextCursor });

    const accs = letters.map((id) => bestAcc[id] ?? 0);
    const avg = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0;
    const finishedAt = Date.now();
    finishSession({
      startedAt, finishedAt,
      durationMs: finishedAt - startedAt,
      letters: letters.slice(),
      retried: retryList.slice(),
      avgAccuracy: avg,
      completed: true,
      sessionSize: letters.length,
    });

    const slot = grantSticker();          // 완주 → 스티커 1장 (PRD 6.1)
    save();
    onFinished?.({ slot, avgAccuracy: avg });
  }

  // ── 시작 / 종료 ─────────────────────────────────────────
  function start(opts = {}) {
    ensureTracer();
    const plan = composeSession(opts);
    letters = plan.letters;
    nextCursor = plan.nextCursor;
    idx = 0; attempt = 1; retryRound = false; retryList = [];
    bestAcc = {}; passedSet = new Set(); seenInSession = new Set();
    startedAt = Date.now();
    active = true;
    fxEl.innerHTML = '';
    showLetter();
  }

  function stop() {
    active = false;
    stopVoice();
    tracer?.enable(false);
  }

  // 시범 버튼 (PRD 5.1)
  demoBtn.addEventListener('click', () => {
    if (!active || busy || tracer.isBusy()) return;
    tracer.enable(false);
    tracer.playDemo(() => tracer.enable(true));
  });

  // 아이가 우연히 빠져나가지 않도록 길게 눌러야 나간다
  let holdTimer = null;
  const startHold = () => { holdTimer = setTimeout(() => { stop(); onExit?.(); }, 1500); };
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
  escapeBtn.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    escapeBtn.addEventListener(ev, cancelHold));

  return { start, stop, resize: () => tracer?.redraw() };
}
