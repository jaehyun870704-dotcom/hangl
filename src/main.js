// ============================================================
// 화면 전환 + 홈 (PRD 7)
//  아이 화면에는 텍스트가 없다. 아이콘과 음성으로만 안내한다.
// ============================================================
import { load, state, todaySessionCount, restartCurriculum, startFromLetter } from './store.js';
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
    renderStickerBook(screens.book, { onHome: () => show('home', { silent: true }), highlight: opts.highlight ?? null });
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

// 부모 메뉴 잠금 — 3초 길게 누르기 (PRD 7)
let holdRaf = 0, holdStart = 0;
const ring = document.getElementById('gate-ring');
function holdBegin(e) {
  e.preventDefault();
  holdStart = performance.now();
  btnParent.classList.add('holding');
  const step = (now) => {
    const t = Math.min(1, (now - holdStart) / 3000);
    ring.style.clipPath = `inset(${(1 - t) * 100}% 0 0 0)`;
    if (t >= 1) { holdEnd(); sfx.tap(); show('parent'); return; }
    holdRaf = requestAnimationFrame(step);
  };
  holdRaf = requestAnimationFrame(step);
}
function holdEnd() {
  cancelAnimationFrame(holdRaf);
  btnParent.classList.remove('holding');
  ring.style.clipPath = 'inset(100% 0 0 0)';
}
btnParent.addEventListener('pointerdown', holdBegin);
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btnParent.addEventListener(ev, holdEnd));

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
    show('reward');
    playReward(screens.reward, slot, (shown) => {
      show('book', { highlight: shown });
      // 스티커북 전체 뷰를 잠깐 보여준 뒤 홈으로 (PRD 6.2 ⑥)
      const t = setTimeout(() => { if (currentScreen === 'book') show('home', { silent: true });

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
} }, 2400);
      screens.book.addEventListener('pointerdown', () => clearTimeout(t), { once: true });
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
