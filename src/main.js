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
    if (location.hash) setHash('');      // 아이 화면으로 나오면 주소도 되돌린다
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
    renderParent(screens.parent, {
      onHome: () => show('home', { silent: true }),
      locked: !opts.unlocked,
      tab: opts.tab ?? null,
    });
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

// 톱니바퀴 — 한 번 누르면 설정(올리기) 화면으로 바로 들어간다.
// 주소도 #voice 로 맞춰 두어, 그 주소를 즐겨찾기 해도 같은 화면이 열린다.
btnParent.addEventListener('click', () => {
  sfx.tap();
  setHash('#voice');
  show('parent', { unlocked: true, tab: 'upload' });
});


/** 주소 끝의 #표시를 바꾼다 (기록을 쌓지 않는다) */
function setHash(hash) {
  const want = hash || location.pathname + location.search;
  if (location.hash !== hash) history.replaceState(null, '', want);
}

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

// 시작할 때의 주소를 먼저 기억해 둔다.
// show('home') 이 주소를 비우기 때문에 그 전에 읽어야 한다.
const startHash = location.hash;

show('home', { silent: true });

// 주소 끝에 #voice 를 붙이면 설정(올리기) 화면이, #record 면 녹음까지 바로 열린다
if (startHash === '#record' || startHash === '#voice') {
  openSettings(startHash === '#record');
}

// 앱이 켜져 있는 상태에서 주소만 바꿔도 열리게 한다 (즐겨찾기로 들어오는 경우)
window.addEventListener('hashchange', () => {
  if (location.hash === '#voice' || location.hash === '#record') {
    openSettings(location.hash === '#record');
  }
});

function openSettings(startRecording) {
  show('parent', { unlocked: true, tab: 'upload' });
  if (startRecording) {
    requestAnimationFrame(() => screens.parent.querySelector('#rec-start')?.click());
  }
}
