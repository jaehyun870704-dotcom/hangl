// ============================================================
// 화면 전환 + 홈 (PRD 7)
//  아이 화면에는 텍스트가 없다. 아이콘과 음성으로만 안내한다.
// ============================================================
import { load, state, todaySessionCount, restartCurriculum, startFromLetter,
  markFinishedOnce } from './store.js';
import { loadStickerMeta, stickerArt } from './stickers.js';
import { initVoiceBank } from './voicebank.js';
import { unlock, say, sfx, stopVoice } from './audio.js';
import { createSessionScreen } from './session.js';
import { playReward } from './screens/reward.js';
import { renderStickerBook } from './screens/stickerbook.js';
import { renderParent } from './screens/parent.js';
import { renderLetterPick } from './screens/letterpick.js';

load();
loadStickerMeta();
initVoiceBank();      // 직접 녹음한 음성을 불러온다 (있으면 TTS 대신 이것으로 재생)

const screens = {
  home: document.getElementById('screen-home'),
  pick: document.getElementById('screen-pick'),
  session: document.getElementById('screen-session'),
  reward: document.getElementById('screen-reward'),
  book: document.getElementById('screen-book'),
  parent: document.getElementById('screen-parent'),
};

let currentScreen = null;

function show(name, opts = {}) {
  stopVoice();
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
  currentScreen = name;

  if (name === 'home') {
    updateBookBadge();
    // 하던 것이 있을 때만 «처음부터» 를 보여 준다
    btnRestart.hidden = !(state.progress.cursor > 0 || state.sessions.length > 0);
    if (audioReady && !opts.silent) {
      setTimeout(() => say('home-greeting'), 350);
    }
  }
  if (name === 'book') {
    renderStickerBook(screens.book, {
      onHome: () => show('home', { silent: true }),
      highlight: opts.highlight ?? null,
      finished: !!opts.finished,
      // 세션을 마치고 온 경우에만 «계속하기» 를 보여 준다
      onContinue: opts.canContinue ? () => beginSession() : null,
    });
    if (opts.finished) {
      sfx.fanfare();
      setTimeout(() => say('great'), 600);
    }
  }
  if (name === 'pick') {
    renderLetterPick(screens.pick, {
      onHome: () => show('home', { silent: true }),
      onPick: (index) => { startFromLetter(index); beginSession({ skipWeak: true }); },
    });
  }
  if (name === 'parent') {
    renderParent(screens.parent, { onHome: () => show('home', { silent: true }) });
  }
}

// ── 오디오 잠금 해제 (브라우저 정책상 첫 터치 이후 재생 가능) ──
let audioReady = false;
function firstTouch() {
  if (audioReady) return;
  audioReady = true;
  unlock();
}
window.addEventListener('pointerdown', firstTouch, { once: true, capture: true });

// ── 홈 ──────────────────────────────────────────────────
const btnStart = document.getElementById('btn-start');
const btnBook = document.getElementById('btn-book');
const btnParent = document.getElementById('btn-parent');
const btnRestart = document.getElementById('btn-restart');
const btnPick = document.getElementById('btn-pick');
const badge = document.getElementById('book-count');

function updateBookBadge() {
  const owned = state.progress.stickers;
  badge.innerHTML = '';
  if (!owned.length) return;
  const last = owned[owned.length - 1];
  const art = stickerArt(last);
  art.style.cssText = 'width:44px;height:44px;background:#fff;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,.15);padding:3px';
  badge.appendChild(art);
}

/** 세션 시작 — 이어하기와 처음부터가 함께 쓴다 */
function beginSession(opts = {}) {
  const limit = state.settings.dailyLimit;
  if (limit > 0 && todaySessionCount() >= limit) {
    // 부모가 상한을 건 경우에만 도달. 막지 않고 스티커북으로 부드럽게 돌린다
    say('done-today');
    show('book');
    return;
  }
  show('session');
  session.start(opts);
}

// 큰 버튼 = 이어하기 (하던 자리에서)
btnStart.addEventListener('click', () => { sfx.tap(); beginSession(); });

// 작은 버튼 = 처음부터 (첫 글자 ㄱ 부터 다시. 스티커와 기록은 그대로 남는다)
btnRestart.addEventListener('click', () => {
  sfx.tap();
  restartCurriculum();
  beginSession();
});

btnBook.addEventListener('click', () => { sfx.tap(); show('book'); });

// 글자 고르기 — 아이가 시작할 글자를 직접 고른다
btnPick.addEventListener('click', () => { sfx.tap(); show('pick'); });

// 부모 메뉴 잠금 — 2초 길게 누르기 (PRD 7)
//   손가락은 2초 동안 가만히 있지 못한다. 조금 움직였다고 취소하면
//   태블릿에서는 영영 안 열린다. 그래서 포인터를 붙잡아 두고,
//   크게(40px 넘게) 움직였을 때만 취소한다.
const HOLD_MS = 2000;
const HOLD_SLOP = 40;
let holdRaf = 0, holdStart = 0, holdId = null, holdX = 0, holdY = 0;
const ring = document.getElementById('gate-ring');

function holdBegin(e) {
  e.preventDefault();
  if (holdId !== null) return;
  holdId = e.pointerId;
  holdX = e.clientX; holdY = e.clientY;
  try { btnParent.setPointerCapture(e.pointerId); } catch {}
  holdStart = performance.now();
  btnParent.classList.add('holding');
  const step = (now) => {
    const t = Math.min(1, (now - holdStart) / HOLD_MS);
    ring.style.clipPath = `inset(${(1 - t) * 100}% 0 0 0)`;
    if (t >= 1) { holdEnd(); sfx.tap(); show('parent'); return; }
    holdRaf = requestAnimationFrame(step);
  };
  holdRaf = requestAnimationFrame(step);
}

function holdMove(e) {
  if (holdId === null || e.pointerId !== holdId) return;
  if (Math.hypot(e.clientX - holdX, e.clientY - holdY) > HOLD_SLOP) holdEnd(e);
}

function holdEnd(e) {
  if (e && holdId !== null) { try { btnParent.releasePointerCapture(holdId); } catch {} }
  holdId = null;
  cancelAnimationFrame(holdRaf);
  btnParent.classList.remove('holding');
  ring.style.clipPath = 'inset(100% 0 0 0)';
}

btnParent.addEventListener('pointerdown', holdBegin);
btnParent.addEventListener('pointermove', holdMove);
['pointerup', 'pointercancel'].forEach((ev) => btnParent.addEventListener(ev, holdEnd));

// ── 세션 ────────────────────────────────────────────────
const session = createSessionScreen({
  canvas: document.getElementById('trace-canvas'),
  dotsEl: document.getElementById('progress-dots'),
  fxEl: document.getElementById('fx-layer'),
  demoBtn: document.getElementById('btn-demo'),
  redoBtn: document.getElementById('btn-redo'),
  escapeBtn: document.getElementById('btn-escape'),
  onExit: () => show('home', { silent: true }),
  onFinished: ({ slot }) => {
    // 자모 24자를 처음 다 뗀 순간인지 (스티커도 이때 딱 다 모인다)
    const justFinished = markFinishedOnce();
    show('reward');
    playReward(screens.reward, slot, (shown) => {
      // 스티커북을 보여 주고 기다린다. 저절로 홈으로 가지 않는다 —
      // 아이가 «계속하기» 를 누르면 다음 글자로, 집 버튼을 누르면 홈으로.
      show('book', { highlight: shown, finished: justFinished, canContinue: true });
    });
  },
});

// ── 기타 ────────────────────────────────────────────────
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('orientationchange', () => setTimeout(() => session.resize(), 300));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
  });
}

show('home', { silent: true });

// 주소 끝에 #record 를 붙이면 녹음 화면이 바로 열린다 (부모가 직접 여는 지름길)
//   http://localhost:8000/#record  → 녹음 스튜디오까지 한 번에
//   http://localhost:8000/#voice   → 성우 녹음 화면까지만
if (location.hash === '#record' || location.hash === '#voice') {
  show('parent');
  requestAnimationFrame(() => {
    screens.parent.querySelector('.lock')?.remove();   // 아이가 아니라 부모가 연 것
    screens.parent.querySelector('#voice-section')?.scrollIntoView({ block: 'start' });
    if (location.hash === '#record') screens.parent.querySelector('#rec-start')?.click();
  });
}
