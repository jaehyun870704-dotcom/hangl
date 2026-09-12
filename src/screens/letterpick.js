// ============================================================
// 글자 고르기 — 아이가 직접 시작할 글자를 고른다
//   고른 글자부터 순서대로 이어진다 (ㄴ 을 고르면 ㄴ ㄷ ㄹ …)
//   색으로 상태를 보여 준다: 초록 = 해봤고 통과, 노랑 = 다시 만날 글자
// ============================================================
import { JAMO } from '../jamo.js';
import { state } from '../store.js';
import { say, sfx } from '../audio.js';

function homeIcon() {
  return `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
    <path d="M32 10 L56 32 h-7v20H15V32H8z" fill="#FFD86B" stroke="#7A5B2E" stroke-width="3.5"
      stroke-linejoin="round"/>
    <rect x="27" y="38" width="10" height="14" rx="2" fill="#7A5B2E"/>
  </svg>`;
}

export function renderLetterPick(root, { onHome, onPick } = {}) {
  const p = state.progress;
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'pick-wrap';

  const home = document.createElement('button');
  home.className = 'home-btn';
  home.setAttribute('aria-label', '홈으로');
  home.innerHTML = homeIcon();
  home.addEventListener('click', () => { sfx.tap(); onHome?.(); });
  wrap.appendChild(home);

  const grid = document.createElement('div');
  grid.className = 'pick-grid';

  let busy = false;
  JAMO.forEach((j, i) => {
    const cell = document.createElement('button');
    cell.className = 'pick-cell';
    cell.innerHTML = `<b class="pc-ch">${j.ch}</b>`
      + (j.emoji ? `<span class="pc-word">${j.emoji} ${j.word}</span>` : '');
    cell.setAttribute('aria-label', `${j.name} ${j.word ?? ''}`);

    const passed = (p.stats?.[j.id]?.passes ?? 0) > 0;
    const again = p.weak?.includes(j.id);
    if (passed) cell.classList.add('done');
    if (again) cell.classList.add('again');
    if (i === p.cursor) cell.classList.add('here');
    if (passed || again) {
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = again ? '↻' : '★';
      cell.appendChild(mark);
    }

    cell.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      sfx.tap();
      say(`jamo-${j.id}`);            // 고른 글자를 한 번 들려주고 시작한다
      cell.classList.add('here');
      setTimeout(() => onPick?.(i), 700);
    });
    grid.appendChild(cell);
  });

  wrap.appendChild(grid);
  root.appendChild(wrap);
}
