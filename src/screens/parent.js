// ============================================================
// 부모 메뉴 (PRD 7)
//  잠금: 홈에서 3초 길게 누르기 → 간단한 산수 문제
//  진도 현황 / 최근 14일 기록 / 설정 / 자녀 프로필
// ============================================================
import { JAMO } from '../jamo.js';
import { stickerCount } from '../stickers.js';
import {
  state, save, updateSettings, resetProgress,
  weakestLetters, completedLetters, dayKey, todaySessionCount,
} from '../store.js';
import { renderRecorder } from './recorder.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
};

export function renderParent(root, { onHome }) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'parent-wrap';
  root.appendChild(wrap);

  // ── 잠금 화면 ───────────────────────────────────────────
  const lock = document.createElement('div');
  lock.className = 'lock';
  const a = 3 + Math.floor(Math.random() * 7);
  const b = 4 + Math.floor(Math.random() * 9);
  const answer = String(a * b);
  let typed = '';
  lock.innerHTML = `
    <div class="lock-inner">
      <p>부모 확인</p>
      <div class="lock-q">${a} × ${b} = ?</div>
      <div class="lock-answer" id="lock-typed">&nbsp;</div>
      <div class="keypad" id="keypad"></div>
      <div style="margin-top:14px"><button class="btn ghost" id="lock-cancel">돌아가기</button></div>
    </div>`;
  root.appendChild(lock);

  const typedEl = lock.querySelector('#lock-typed');
  const pad = lock.querySelector('#keypad');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'].forEach((label) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (label === '←') typed = typed.slice(0, -1);
      else if (label === '✓') {
        if (typed === answer) { lock.remove(); }
        else {
          typedEl.classList.add('bad');
          setTimeout(() => { typedEl.classList.remove('bad'); typed = ''; typedEl.textContent = ' '; }, 400);
        }
      } else if (typed.length < 4) typed += label;
      typedEl.textContent = typed || ' ';
    });
    pad.appendChild(btn);
  });
  lock.querySelector('#lock-cancel').addEventListener('click', () => onHome?.());

  // ── 본문 ────────────────────────────────────────────────
  const p = state.progress;
  const st = state.settings;
  const done = new Set(completedLetters());
  const weak = weakestLetters(5);
  const weakIds = new Set([...weak.map((w) => w.id), ...p.weak]);

  const head = document.createElement('div');
  head.className = 'parent-top';
  head.innerHTML = `
    <div>
      <h1>${p.stickers.length ? '진도 현황' : '아직 기록이 없습니다'}</h1>
      <div class="pills">
        <span class="pill">완료 자모 ${done.size} / 24</span>
        <span class="pill">스티커 ${p.stickers.length} / ${stickerCount()}</span>
        <span class="pill">현재 세션 크기 ${p.sessionSize}자</span>
        <span class="pill">오늘 세션 ${todaySessionCount()}회</span>
      </div>
    </div>
    <div class="ctl">
      <button class="btn ghost" id="p-voice">성우 녹음</button>
      <button class="btn ghost" id="p-home">아이 화면으로</button>
    </div>`;
  wrap.appendChild(head);
  head.querySelector('#p-home').addEventListener('click', () => onHome?.());
  head.querySelector('#p-voice').addEventListener('click', () =>
    wrap.querySelector('#voice-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

  // 자모 진도
  wrap.insertAdjacentHTML('beforeend', '<h2>자모 24자</h2>');
  const card1 = document.createElement('div');
  card1.className = 'card';
  const grid = document.createElement('div');
  grid.className = 'jamo-grid';
  JAMO.forEach((j) => {
    const span = document.createElement('span');
    span.textContent = j.ch;
    if (done.has(j.id)) span.classList.add('done');
    if (weakIds.has(j.id)) span.classList.add('weak');
    const s = p.stats[j.id];
    span.title = s ? `${j.name} · 시도 ${s.attempts}회 · 평균 ${pct(s.accSum / s.attempts)}` : j.name;
    grid.appendChild(span);
  });
  card1.appendChild(grid);
  card1.insertAdjacentHTML('beforeend',
    `<div class="empty-note">초록 = 1회 이상 통과 · 빨강 = 취약하거나 다시 만날 글자${p.weak.length ? ` (${p.weak.length}자 대기 중)` : ''}</div>`);
  wrap.appendChild(card1);

  // 취약 자모
  wrap.insertAdjacentHTML('beforeend', '<h2>취약 자모 상위 5</h2>');
  const card2 = document.createElement('div');
  card2.className = 'card';
  if (!weak.length) {
    card2.innerHTML = '<div class="empty-note">통과 기준선에 못 미치는 자모가 없습니다.</div>';
  } else {
    card2.innerHTML = `<table class="rec"><thead><tr><th>자모</th><th>평균 정확도</th><th>시도</th></tr></thead>
      <tbody>${weak.map((w) => {
        const j = JAMO.find((x) => x.id === w.id);
        return `<tr><td>${j.ch} (${j.name})</td><td>${pct(w.avg)}</td><td>${w.attempts}회</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  wrap.appendChild(card2);

  // 최근 14일 기록
  wrap.insertAdjacentHTML('beforeend', '<h2>최근 14일 세션 기록</h2>');
  const card3 = document.createElement('div');
  card3.className = 'card';
  const since = Date.now() - 14 * 864e5;
  const recent = state.sessions.filter((s) => s.finishedAt >= since);
  if (!recent.length) {
    card3.innerHTML = '<div class="empty-note">최근 14일 기록이 없습니다.</div>';
  } else {
    card3.innerHTML = `<table class="rec">
      <thead><tr><th>날짜</th><th>완주</th><th>소요 시간</th><th>평균 정확도</th><th>글자</th></tr></thead>
      <tbody>${recent.map((s) => `<tr>
        <td>${dayKey(s.finishedAt).slice(5)}</td>
        <td>${s.completed ? '○' : '—'}</td>
        <td>${mmss(s.durationMs)}</td>
        <td>${pct(s.avgAccuracy)}</td>
        <td>${s.letters.map((id) => JAMO.find((j) => j.id === id)?.ch ?? '').join(' ')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  wrap.appendChild(card3);

  // 설정
  wrap.insertAdjacentHTML('beforeend', '<h2>설정</h2>');
  const card4 = document.createElement('div');
  card4.className = 'card';
  wrap.appendChild(card4);

  const rows = [
    {
      label: '세션 크기', note: '자동 = 최근 세션 정확도로 조절 (PRD 4.4)',
      control: () => {
        const sel = document.createElement('select');
        ['auto', 2, 3, 4, 5, 6].forEach((v) => {
          const o = document.createElement('option');
          o.value = String(v);
          o.textContent = v === 'auto' ? '자동' : `${v}자 고정`;
          if (String(st.sessionSizeMode) === String(v)) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => {
          const v = sel.value;
          updateSettings({ sessionSizeMode: v === 'auto' ? 'auto' : Number(v) });
          if (v !== 'auto') { state.progress.sessionSize = Number(v); save(); }
        });
        return sel;
      },
    },
    slider('확장 기준선', 'expandThreshold', 0.4, 0.95, 0.05, '최근 3세션 평균이 이 값 이상이면 세션 크기 +1자'),
    slider('유지 기준선', 'holdThreshold', 0.2, 0.8, 0.05, '이 값 미만이면 세션 크기 -1자 (최소 2자)'),
    slider('글자 통과 기준', 'passThreshold', 0.3, 0.9, 0.05, '이 값 이상이면 한 번에 통과. 낮출수록 쉬워집니다'),
    slider('점선 밴드 폭', 'band', 0.06, 0.24, 0.01, '선 밖으로 나가도 인정되는 폭. 넓힐수록 관대해집니다'),
    slider('음성 볼륨', 'volume', 0, 1, 0.05, ''),
    {
      label: '하루 세션 상한', note: '0 = 제한 없음 (기본값)',
      control: () => {
        const sel = document.createElement('select');
        [0, 1, 2, 3, 4, 5].forEach((v) => {
          const o = document.createElement('option');
          o.value = String(v);
          o.textContent = v === 0 ? '제한 없음' : `${v}회`;
          if (st.dailyLimit === v) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => updateSettings({ dailyLimit: Number(sel.value) }));
        return sel;
      },
    },
  ];

  function slider(label, key, min, max, step, note) {
    return {
      label, note,
      control: () => {
        const box = document.createElement('div');
        box.className = 'ctl';
        const val = document.createElement('span');
        val.className = 'val';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = min; input.max = max; input.step = step;
        input.value = st[key];
        const show = () => { val.textContent = key === 'band' ? `${Math.round(input.value * 100)}%` : pct(Number(input.value)); };
        show();
        input.addEventListener('input', () => { show(); });
        input.addEventListener('change', () => updateSettings({ [key]: Number(input.value) }));
        box.append(input, val);
        return box;
      },
    };
  }

  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'row';
    const left = document.createElement('div');
    left.innerHTML = `<label>${r.label}</label>${r.note ? `<small>${r.note}</small>` : ''}`;
    row.append(left, r.control());
    card4.appendChild(row);
  });

  // 성우 녹음 (PRD 4.2 · 10-3)
  wrap.insertAdjacentHTML('beforeend', '<h2 id="voice-section">성우 녹음</h2>');
  const recHost = document.createElement('div');
  wrap.appendChild(recHost);
  renderRecorder(recHost);

  // 자녀 프로필
  wrap.insertAdjacentHTML('beforeend', '<h2>자녀 프로필</h2>');
  const card5 = document.createElement('div');
  card5.className = 'card';
  const nameRow = document.createElement('div');
  nameRow.className = 'row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = state.data.profile.name || '';
  nameInput.placeholder = '이름';
  nameInput.addEventListener('change', () => { state.data.profile.name = nameInput.value.trim(); save(); });
  nameRow.innerHTML = '<div><label>이름</label><small>기기에만 저장됩니다. 서버로 전송하지 않습니다</small></div>';
  nameRow.appendChild(nameInput);
  card5.appendChild(nameRow);

  const resetRow = document.createElement('div');
  resetRow.className = 'row';
  resetRow.innerHTML = '<div><label>진도 초기화</label><small>자모 진도·스티커·세션 기록을 모두 지웁니다. 설정은 유지됩니다</small></div>';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn danger';
  resetBtn.textContent = '초기화';
  let armed = false;
  resetBtn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      resetBtn.textContent = '한 번 더 누르면 삭제';
      setTimeout(() => { armed = false; resetBtn.textContent = '초기화'; }, 4000);
      return;
    }
    resetProgress();
    renderParent(root, { onHome });
    root.querySelector('.lock')?.remove();
  });
  resetRow.appendChild(resetBtn);
  card5.appendChild(resetRow);
  wrap.appendChild(card5);

  wrap.insertAdjacentHTML('beforeend',
    '<div class="empty-note" style="margin-top:18px">모든 데이터는 이 기기에만 저장됩니다. 계정·서버 전송·광고·결제 없음.</div>');
}
