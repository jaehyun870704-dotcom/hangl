// ============================================================
// 학습 세션 진행 (PRD 4.3 / 4.4 / 5.3)
//  - 아이는 어떤 경우에도 세션을 완주한다
//  - 실패는 "다시 만나는 글자"로만 반영된다
//
// 3단계 낱말은 한 글자씩 쓴다. «사과» 는 «사» 를 크게 쓰고 «과» 를 크게 쓴다.
// 두 글자를 한 화면에 넣으면 네 살 손에는 글자가 너무 작다.
// 위쪽에 낱말 전체를 두어 지금 어디를 쓰는지 보여 준다.
// ============================================================
import { state, recordLetter, finishSession, grantSticker, applySessionOutcome, save,
  completedLetters } from './store.js';
import { createTracer, MISS_LIMIT } from './trace.js';
import { say, sfx, stopVoice } from './audio.js';

/** 이 글자를 읽을 때 쓰는 음성 키. 1단계는 녹음해 둔 것이 있다 */
const voiceKeyFor = (stageId, text, item) =>
  (stageId === 'jamo' ? `jamo-${item.id}` : `say-${text}`);

/** 제자리 섞기 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 이번 세션에 배정할 항목 목록.
 *
 * 1단계 자모는 ㄱ ㄴ ㄷ 순서대로 간다 — 배우는 순서 자체가 뜻이 있다.
 * 2·3단계는 섞어서 낸다. 가나다라마바사 를 순서대로 외워 버리면
 * 글자를 읽는 것이 아니라 차례를 외우는 것이 된다.
 * 아직 못 뗀 것 중에서 먼저 고르고, 다 뗐으면 전체에서 고른다.
 */
export function composeSession({ skipWeak = false } = {}) {
  const p = state.progress;
  const stage = state.stage;
  const list = stage.items;
  const size = Math.max(2, Math.min(state.settings.maxSessionSize, p.sessionSize));
  const shuffled = stage.shuffle && state.settings.randomOrder !== false;
  const letters = [];

  // 아이가 «글자 고르기» 에서 직접 고른 것은 무조건 맨 앞에 온다
  if (shuffled && skipWeak && list.length) letters.push(list[p.cursor % list.length].id);

  // 다시 만나야 할 것을 먼저 (새 진도가 멈추지 않도록 최대 1/3)
  // 아이가 글자를 직접 골랐을 때는 고른 글자가 맨 앞에 와야 하므로 건너뛴다
  const weakQuota = Math.max(1, Math.floor(size / 3));
  if (!skipWeak) {
    for (const id of p.weak.slice(0, weakQuota)) {
      if (letters.length < size - 1 && list.some((it) => it.id === id)) letters.push(id);
    }
  }

  if (shuffled) {
    const passed = new Set(completedLetters());
    const taken = new Set(letters);
    let pool = list.filter((it) => !taken.has(it.id) && !passed.has(it.id));
    if (!pool.length) pool = list.filter((it) => !taken.has(it.id));   // 다 뗐으면 전체에서
    shuffle(pool);
    while (letters.length < size && pool.length) letters.push(pool.pop().id);
    return { letters, nextCursor: p.cursor + letters.length };
  }

  // 커리큘럼 순서대로 새 항목 채우기 (끝까지 가면 처음부터 반복)
  let cursor = p.cursor;
  let guard = 0;
  while (letters.length < size && guard++ < 400) {
    const it = list[cursor % list.length];
    if (!letters.includes(it.id)) letters.push(it.id);
    cursor += 1;
  }
  return { letters, nextCursor: cursor };
}

export function createSessionScreen(deps) {
  const { canvas, dotsEl, fxEl, wordEl, demoBtn, redoBtn, escapeBtn, onFinished, onExit } = deps;

  let tracer = null;
  let stageId = 'jamo';
  let letters = [];
  let nextCursor = 0;
  let idx = 0;
  let partIdx = 0;
  let partBest = [];     // 이 항목의 글자별 최고 정확도
  let attempt = 1;
  let retryRound = false;
  let retryList = [];
  let bestAcc = {};      // itemId -> 이번 세션 최고 정확도
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
      onTap: () => sayPart(),
      // 획을 끝까지 긋지 않아 세지 않은 경우 — 조용히 지우고 다시 그리게 둔다.
      // 세 번째에는 «한 번 더 해볼까?» 로 한 번만 말을 건다 (닦달하지 않는다)
      onShort: (i, r, n) => { sfx.soft(); if (n === MISS_LIMIT) say('try-again'); },
    });
    return tracer;
  }

  const itemById = (id) => state.stage.items.find((it) => it.id === id) ?? null;
  const currentItem = () => {
    const id = retryRound ? retryList[idx] : letters[idx];
    return id ? itemById(id) : null;
  };
  const currentPart = () => currentItem()?.parts[partIdx] ?? null;

  /** 지금 쓰고 있는 글자를 읽어 준다 */
  function sayPart() {
    const item = currentItem();
    const part = currentPart();
    if (!item || !part) return;
    say(voiceKeyFor(stageId, part.text, item), part.text);
  }

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

  /** 지금 쓰는 것이 무엇인지 글자 위에 보여 준다 */
  function paintWord() {
    if (!wordEl) return;
    const item = currentItem();
    if (!item) { wordEl.innerHTML = ''; return; }

    // 1단계 — 그 자모로 시작하는 낱말을 함께 (그림이 있어 못 읽어도 안다)
    if (stageId === 'jamo') {
      wordEl.innerHTML = item.emoji ? `<b>${item.emoji}</b><span>${item.word}</span>` : '';
      return;
    }
    // 2단계 — 글자 하나뿐이라 캔버스에 다 보인다
    if (item.parts.length < 2) {
      wordEl.innerHTML = item.emoji ? `<b>${item.emoji}</b><span>${item.text}</span>` : '';
      return;
    }
    // 3단계 — 낱말 전체를 보여 주고 지금 쓰는 글자에 표시한다
    const chars = item.parts
      .map((p, i) => `<i class="${i === partIdx ? 'on' : (i < partIdx ? 'ok' : '')}">${p.text}</i>`)
      .join('');
    wordEl.innerHTML = `${item.emoji ? `<b>${item.emoji}</b>` : ''}<span class="word-parts">${chars}</span>`;
  }

  // ── 글자 표시 ───────────────────────────────────────────
  function showLetter() {
    const item = currentItem();
    const part = currentPart();
    if (!item || !part) return;
    busy = false;
    renderDots();
    paintWord();

    const st = state.settings;
    const firstSight = !seenInSession.has(`${item.id}/${partIdx}`);
    tracer.setChar(part, {
      band: st.band,
      startR: st.startR,
      minCover: st.strokeMinCoverage,
      guideScale: attempt > 1 ? 1.3 : 1,   // 재시도 시 점선을 굵게 (PRD 5.4)
    });
    tracer.enable(false);

    // 낱말의 첫 글자에서는 낱말 전체를 먼저 들려주고, 이어서 쓸 글자를 읽는다
    const whole = item.parts.length > 1 && partIdx === 0;
    if (whole) {
      say(voiceKeyFor(stageId, item.text, item), item.text);
      setTimeout(() => { if (active) sayPart(); }, 1000);
    } else {
      sayPart();                          // 등장 시 1회 자동 재생 (PRD 4.2)
    }

    const needDemo = firstSight || attempt > 1;
    seenInSession.add(`${item.id}/${partIdx}`);
    if (needDemo) {
      setTimeout(() => {
        if (!active) return;
        tracer.playDemo(() => tracer.enable(true));
      }, whole ? 1400 : 650);
    } else {
      tracer.enable(true);
    }
  }

  // ── 글자 1자 완료 ───────────────────────────────────────
  function onCharComplete(acc) {
    if (busy) return;
    busy = true;
    tracer.enable(false);

    const item = currentItem();
    const th = state.settings.passThreshold;
    partBest[partIdx] = Math.max(partBest[partIdx] ?? 0, acc);

    // 낱말 중간 글자 — 항목 판정은 마지막 글자에서 한 번만 한다
    if (partIdx < item.parts.length - 1) {
      if (acc >= th || retryRound) {
        sfx.charPass();
        sparkle(false);
        nextPart(900);
      } else if (attempt === 1) {
        sfx.soft();
        say('try-again');                  // 부정 표현 금지 (PRD 5.4)
        attempt = 2;
        setTimeout(() => { if (active) showLetter(); }, 1100);
      } else {
        // 두 번 다 못 맞췄다. 막지 않고 다음 글자로 넘어간다
        sfx.soft();
        nextPart(1200);
      }
      return;
    }

    // 항목의 마지막 글자 — 글자별 점수의 평균으로 판정한다
    const parts = partBest.slice(0, item.parts.length).map((v) => v ?? 0);
    const itemAcc = parts.reduce((a, b) => a + b, 0) / parts.length;
    const pass = itemAcc >= th;
    bestAcc[item.id] = Math.max(bestAcc[item.id] ?? 0, itemAcc);
    recordLetter(item.id, itemAcc, pass);
    if (pass) passedSet.add(item.id);

    if (retryRound) {
      // 재도전 라운드는 결과와 무관하게 통과 처리 (PRD 5.3)
      praise(item, true);
      return;
    }

    if (pass) {
      praise(item, true);
    } else if (attempt === 1 && item.parts.length === 1) {
      sfx.soft();
      say('try-again');
      attempt = 2;
      setTimeout(() => { if (active) showLetter(); }, 1100);
    } else {
      // 못 맞췄다. 막지는 않지만 «잘했어» 라고 하지도 않는다.
      // 이름만 한 번 더 들려주고 넘어가고, 재도전 목록에 담는다.
      if (!retryList.includes(item.id)) retryList.push(item.id);
      sfx.soft();
      setTimeout(() => { if (active) say(voiceKeyFor(stageId, item.text, item), item.text); }, 500);
      setTimeout(next, 1900);
    }
  }

  /** 낱말의 다음 글자로 */
  function nextPart(delay) {
    partIdx += 1;
    attempt = 1;
    setTimeout(() => { if (active) showLetter(); }, delay);
  }

  /**
   * 칭찬하고 넘어간다.
   * 다 쓴 것을 한 번 더 들려준다 — 방금 쓴 모양과 소리가 붙게 하려고.
   */
  function praise(item, strong) {
    sfx.charPass();
    sparkle(strong);
    say('good');   // 제대로 해낸 경우에만 부른다
    setTimeout(() => { if (active) say(voiceKeyFor(stageId, item.text, item), item.text); }, 950);
    setTimeout(next, 2300);
  }

  function next() {
    if (!active) return;
    attempt = 1;
    partIdx = 0;
    partBest = [];
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
    if (wordEl) wordEl.innerHTML = '';
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
    stageId = state.stage.id;
    const plan = composeSession(opts);
    letters = plan.letters;
    nextCursor = plan.nextCursor;
    idx = 0; partIdx = 0; partBest = []; attempt = 1;
    retryRound = false; retryList = [];
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

  // 다시 쓰기 — 쓰던 글자를 지우고 처음부터. 시도 횟수는 늘리지 않는다
  redoBtn?.addEventListener('click', () => {
    if (!active || busy || tracer.isBusy()) return;
    const part = currentPart();
    if (!part) return;
    sfx.tap();
    const st = state.settings;
    tracer.setChar(part, {
      band: st.band, startR: st.startR, minCover: st.strokeMinCoverage,
      guideScale: attempt > 1 ? 1.3 : 1,
    });
    tracer.enable(true);
  });

  // 시범 버튼 (PRD 5.1)
  demoBtn.addEventListener('click', () => {
    if (!active || busy || tracer.isBusy()) return;
    tracer.enable(false);
    tracer.playDemo(() => tracer.enable(true));
  });

  // 홈으로 — 한 번 누르면 나간다
  escapeBtn.addEventListener('click', () => { sfx.tap(); stop(); onExit?.(); });

  return { start, stop, resize: () => tracer?.redraw() };
}
