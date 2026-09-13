// ============================================================
// 글자 고르기 — 아이가 직접 시작할 자리를 고른다
//   고른 것부터 순서대로 이어진다 (ㄴ 을 고르면 ㄴ ㄷ ㄹ …)
//   색으로 상태를 보여 준다: 초록 = 해봤고 통과, 노랑 = 다시 만날 것
//   지금 단계의 목록을 보여 준다. 3단계는 100개라 밑으로 넘어간다.
// ============================================================
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
  const stage = state.stage;
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'pick-wrap';

  const home = document.createElement('button');
  home.className = 'home-btn';
  home.setAttribute('aria-label', '홈으로');
  home.innerHTML = homeIcon();
  home.addEventListener('click', () => { sfx.tap(); onHome?.(); });
  wrap.appendChild(home);

  const title = document.createElement('div');
  title.className = 'pick-title';
  title.textContent = `${stage.no}단계 ${stage.name}`;
  wrap.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'pick-grid';

  let busy = false;
  stage.items.forEach((it, i) => {
    const len = [...it.text].length;
    const cell = document.createElement('button');
    cell.className = 'pick-cell';
    const sub = stage.id === 'jamo'
      ? (it.emoji ? `${it.emoji} ${it.word}` : '')
      : (it.emoji ?? '');
    cell.innerHTML = `<b class="pc-ch${len > 1 ? ` len${Math.min(len, 3)}` : ''}">${it.text}</b>`
      + (sub ? `<span class="pc-word">${sub}</span>` : '');
    cell.setAttribute('aria-label', `${it.name ?? it.text} ${stage.id === 'jamo' ? (it.word ?? '') : ''}`);

    const passed = (p.stats?.[it.id]?.passes ?? 0) > 0;
    const again = p.weak?.includes(it.id);
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
      // 고른 것을 한 번 들려주고 시작한다
      say(stage.id === 'jamo' ? `jamo-${it.id}` : `say-${it.text}`, it.name ?? it.text);
      cell.classList.add('here');
      setTimeout(() => onPick?.(i), 700);
    });
    grid.appendChild(cell);
  });

  wrap.appendChild(grid);
  root.appendChild(wrap);

  // 하던 자리가 보이도록 스크롤을 맞춘다 (3단계는 100개라 밑에 있을 수 있다)
  requestAnimationFrame(() => {
    grid.querySelector('.pick-cell.here')?.scrollIntoView({ block: 'center' });
  });
}
