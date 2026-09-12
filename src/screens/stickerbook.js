// ============================================================
// 스티커북 (PRD 6.3)
//  - 캐릭터 수(stickers.json)에 맞춰 칸과 판 수를 정한다
//  - 못 받은 칸은 실루엣으로 보인다 (다음 목표 시각화)
//  - 받은 스티커를 누르면 움직이고 이름을 말한다
//  - 도장을 누르면 "참 잘했어요!" 재생
// ============================================================
import { stickerArt, stickerVoiceKey, stickerCount, loadStickerMeta } from '../stickers.js';
import { say, sfx } from '../audio.js';
import { state } from '../store.js';


function homeIcon() {
  return `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
    <path d="M32 10 L56 32 h-7v20H15V32H8z" fill="#FFD86B" stroke="#7A5B2E" stroke-width="3.5"
      stroke-linejoin="round"/>
    <rect x="27" y="38" width="10" height="14" rx="2" fill="#7A5B2E"/>
  </svg>`;
}

export async function renderStickerBook(root, { onHome, onContinue, highlight = null, finished = false } = {}) {
  await loadStickerMeta();
  const TOTAL = stickerCount();
  const PER_PAGE = TOTAL <= 12 ? TOTAL : 8;     // 12종 이하면 한 판에 다 넣는다
  const PAGES = Math.ceil(TOTAL / PER_PAGE);
  const COLS = Math.ceil(PER_PAGE / 2);
  const owned = new Set(state.progress.stickers);
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'book-wrap';

  const home = document.createElement('button');
  home.className = 'home-btn';
  home.setAttribute('aria-label', '홈으로');
  home.innerHTML = homeIcon();
  home.addEventListener('click', () => { sfx.tap(); onHome?.(); });
  wrap.appendChild(home);

  const viewport = document.createElement('div');
  viewport.className = 'book-viewport';
  const pages = document.createElement('div');
  pages.className = 'book-pages';
  viewport.appendChild(pages);
  wrap.appendChild(viewport);

  for (let p = 0; p < PAGES; p++) {
    const page = document.createElement('div');
    page.className = 'book-page';
    page.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    for (let k = 0; k < PER_PAGE; k++) {
      const slot = p * PER_PAGE + k + 1;
      if (slot > TOTAL) break;
      const got = owned.has(slot);
      const cell = document.createElement('div');
      cell.className = `slot ${got ? 'got' : 'empty'}`;
      cell.appendChild(stickerArt(slot));

      if (got) {
        const st = document.createElement('div');
        st.className = 'mini-stamp';
        st.innerHTML = '참<br>잘했어요';
        st.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx.stamp();
          say('great');
        });
        cell.appendChild(st);

        cell.addEventListener('click', () => {
          const art = cell.querySelector('.art');
          art.classList.remove('wiggle');
          void art.offsetWidth;
          art.classList.add('wiggle');
          sfx.pop();
          say(stickerVoiceKey(slot));
        });

        if (highlight === slot) {
          cell.style.boxShadow = 'inset 0 0 0 5px #4CB8A0';
          setTimeout(() => cell.querySelector('.art')?.classList.add('wiggle'), 250);
        }
      }
      page.appendChild(cell);
    }
    pages.appendChild(page);
  }

  // 자모를 다 뗀 날 — 축하 띠
  if (finished) {
    const banner = document.createElement('div');
    banner.className = 'book-banner';
    banner.innerHTML = '<b>자모 24자를 모두 썼어요!</b>'
      + `<span>친구 ${TOTAL}명을 다 모았어요</span>`;
    wrap.insertBefore(banner, viewport);
  }

  const nav = document.createElement('div');
  nav.className = 'book-nav';
  if (PAGES < 2) nav.style.visibility = 'hidden';   // 한 판뿐이면 넘길 것이 없다
  const dots = [];
  for (let p = 0; p < PAGES; p++) {
    const d = document.createElement('i');
    d.addEventListener('click', () => go(p));
    nav.appendChild(d);
    dots.push(d);
  }
  wrap.appendChild(nav);

  // 계속하기 — 스티커를 본 뒤 아이가 눌러서 다음 글자로 간다 (저절로 넘어가지 않는다)
  if (onContinue) {
    const go2 = document.createElement('button');
    go2.className = 'continue-btn';
    go2.setAttribute('aria-label', '계속하기');
    go2.innerHTML = `<svg viewBox="0 0 64 64" width="42" height="42" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="#FFE9A8" stroke="#7A5B2E" stroke-width="3.5"/>
        <path d="M26 20 L46 32 L26 44 Z" fill="#7A5B2E"/>
      </svg>`;
    go2.addEventListener('click', () => { sfx.tap(); onContinue(); });
    wrap.appendChild(go2);
  }

  root.appendChild(wrap);

  let page = highlight ? Math.floor((highlight - 1) / PER_PAGE) : 0;
  function go(p) {
    page = Math.max(0, Math.min(PAGES - 1, p));
    pages.style.transform = `translateX(${-page * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('on', i === page));
  }
  go(page);

  // 스와이프
  let sx = 0, sy = 0, dragging = false;
  viewport.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; });
  viewport.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
      sfx.tap();
      go(page + (dx < 0 ? 1 : -1));
    }
  });
  viewport.addEventListener('pointercancel', () => { dragging = false; });

  return { go };
}
