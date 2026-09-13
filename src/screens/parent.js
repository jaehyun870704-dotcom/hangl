// ============================================================
// 부모 메뉴 (PRD 7)
//  잠금: 간단한 산수 문제 (톱니바퀴로 들어오면 잠금 없음)
//  진도 현황 / 올리기 / 설정 · 백업
// ============================================================
import { STAGES, stageOf } from '../curriculum.js';
import { stickerCount } from '../stickers.js';
import {
  state, save, updateSettings, resetProgress, resetStage,
  weakestLetters, completedLetters, dayKey, todaySessionCount,
  listBackups, createBackup, restoreBackup, deleteBackup,
} from '../store.js';
import { renderRecorder } from './recorder.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초`;
};
const when = (ts) => {
  const d = new Date(ts);
  return `${dayKey(ts).slice(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 세션 기록에 적힌 항목 id 를 사람이 읽을 글자로 */
function textOf(stageId, itemId) {
  return stageOf(stageId).items.find((it) => it.id === itemId)?.text ?? '';
}

/**
 * 부모(관리자) 화면.
 * locked=false 면 산수 확인 없이 바로 들어간다 — 톱니바퀴를 눌러 들어온 경우.
 * tab 을 주면 그 탭을 열어 둔다.
 */
export function renderParent(root, { onHome, locked = true, tab = null }) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'parent-wrap';
  root.appendChild(wrap);

  const again = (t) => {
    renderParent(root, { onHome, locked: false, tab: t });
    root.querySelector('.lock')?.remove();
  };

  // ── 잠금 화면 (locked 일 때만) ───────────────────────────
  if (locked) buildLock();

  function buildLock() {
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
  }

  // ── 머리말 ──────────────────────────────────────────────
  const st = state.settings;
  const here = state.stage;
  const p = state.progress;

  const head = document.createElement('div');
  head.className = 'parent-top';
  const pills = STAGES.map((s) => {
    const done = completedLetters(s.id).length;
    const got = state.all.stages[s.id].stickers.length;
    return `<span class="pill${s.id === here.id ? ' on' : ''}">${s.no}단계 ${s.name} `
      + `${done}/${s.items.length} · 스티커 ${got}/${stickerCount(s.id)}</span>`;
  }).join('');
  head.innerHTML = `
    <div>
      <h1>${state.sessions.length ? '진도 현황' : '아직 기록이 없습니다'}</h1>
      <div class="pills">
        ${pills}
        <span class="pill">세션 크기 ${p.sessionSize}자</span>
        <span class="pill">오늘 세션 ${todaySessionCount()}회</span>
      </div>
    </div>
    <div class="ctl">
      <button class="btn ghost" id="p-voice">파일 올리기</button>
      <button class="btn ghost" id="p-home">아이 화면으로</button>
    </div>`;
  wrap.appendChild(head);

  // ── 탭 — 진도 / 올리기 / 설정 ───────────────────────────
  const tabbar = document.createElement('div');
  tabbar.className = 'tabbar';
  const panels = {};
  const tabs = [['progress', '진도'], ['upload', '올리기'], ['settings', '설정 · 백업']];
  tabs.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = label;
    b.dataset.tab = id;
    b.addEventListener('click', () => showTab(id));
    tabbar.appendChild(b);
    const panel = document.createElement('div');
    panel.className = 'tab-panel';
    panels[id] = panel;
  });
  wrap.appendChild(tabbar);
  Object.values(panels).forEach((el) => wrap.appendChild(el));

  function showTab(id) {
    tabbar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== id; });
    wrap.scrollTop = 0;
  }
  head.querySelector('#p-home').addEventListener('click', () => onHome?.());
  head.querySelector('#p-voice').addEventListener('click', () => showTab('upload'));

  // ── 진도 — 단계마다 한 판씩 ─────────────────────────────
  for (const s of STAGES) {
    const done = new Set(completedLetters(s.id));
    const sp = state.all.stages[s.id];
    const weak = weakestLetters(5, s.id);
    const weakIds = new Set([...weak.map((w) => w.id), ...sp.weak]);

    panels.progress.insertAdjacentHTML('beforeend',
      `<h2>${s.no}단계 ${s.name} <small>${s.hint} · ${s.items.length}개</small></h2>`);
    const card = document.createElement('div');
    card.className = 'card';
    const grid = document.createElement('div');
    grid.className = `jamo-grid${s.id === 'word' ? ' wide' : ''}`;
    s.items.forEach((it) => {
      const span = document.createElement('span');
      span.textContent = it.text;
      if (done.has(it.id)) span.classList.add('done');
      if (weakIds.has(it.id)) span.classList.add('weak');
      const r = sp.stats[it.id];
      span.title = r ? `${it.name ?? it.text} · 시도 ${r.attempts}회 · 평균 ${pct(r.accSum / r.attempts)}`
        : (it.name ?? it.text);
      grid.appendChild(span);
    });
    card.appendChild(grid);
    card.insertAdjacentHTML('beforeend',
      '<div class="empty-note">초록 = 1회 이상 통과 · 빨강 = 취약하거나 다시 만날 것'
      + `${sp.weak.length ? ` (${sp.weak.length}개 대기 중)` : ''}`
      + ` · 스티커 ${sp.stickers.length}/${stickerCount(s.id)}</div>`);

    if (weak.length) {
      card.insertAdjacentHTML('beforeend',
        '<table class="rec" style="margin-top:12px"><thead><tr><th>취약</th><th>평균 정확도</th><th>시도</th></tr></thead>'
        + `<tbody>${weak.map((w) => `<tr><td>${textOf(s.id, w.id)}</td><td>${pct(w.avg)}</td><td>${w.attempts}회</td></tr>`).join('')}</tbody></table>`);
    }

    const clr = document.createElement('button');
    clr.className = 'btn ghost';
    clr.style.marginTop = '12px';
    clr.textContent = `${s.no}단계만 초기화`;
    let armedS = false;
    clr.addEventListener('click', () => {
      if (!armedS) {
        armedS = true;
        clr.textContent = '한 번 더 누르면 지웁니다';
        setTimeout(() => { armedS = false; clr.textContent = `${s.no}단계만 초기화`; }, 4000);
        return;
      }
      createBackup(`${s.no}단계 지우기 직전`);
      resetStage(s.id);
      again('progress');
    });
    card.appendChild(clr);
    panels.progress.appendChild(card);
  }

  // 최근 14일 기록
  panels.progress.insertAdjacentHTML('beforeend', '<h2>최근 14일 세션 기록</h2>');
  const card3 = document.createElement('div');
  card3.className = 'card';
  const since = Date.now() - 14 * 864e5;
  const recent = state.sessions.filter((s) => s.finishedAt >= since);
  if (!recent.length) {
    card3.innerHTML = '<div class="empty-note">최근 14일 기록이 없습니다.</div>';
  } else {
    card3.innerHTML = `<table class="rec">
      <thead><tr><th>날짜</th><th>단계</th><th>완주</th><th>소요 시간</th><th>평균 정확도</th><th>쓴 글자</th></tr></thead>
      <tbody>${recent.map((s) => {
        const sg = stageOf(s.stage ?? 'jamo');
        return `<tr>
          <td>${dayKey(s.finishedAt).slice(5)}</td>
          <td>${sg.no}. ${sg.name}</td>
          <td>${s.completed ? '○' : '—'}</td>
          <td>${mmss(s.durationMs)}</td>
          <td>${pct(s.avgAccuracy)}</td>
          <td>${s.letters.map((id) => textOf(sg.id, id)).join(' ')}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
  panels.progress.appendChild(card3);

  // ── 설정 ────────────────────────────────────────────────
  panels.settings.insertAdjacentHTML('beforeend', '<h2>설정</h2>');
  const card4 = document.createElement('div');
  card4.className = 'card';
  panels.settings.appendChild(card4);

  const rows = [
    {
      label: '세션 크기', note: '자동 = 최근 세션 정확도로 조절 (PRD 4.4). 단계마다 따로 조절됩니다',
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
    slider('획 인정 기준', 'strokeMinCoverage', 0, 0.9, 0.05,
      '점선을 이만큼은 따라가야 «한 획 그었다»로 셉니다. 0으로 두면 살짝 스치기만 해도 획이 됩니다. '
      + '아이가 다 그리기도 전에 글자가 저절로 채워진다면 이 값을 올리세요'),
    slider('음성 볼륨', 'volume', 0, 1, 0.05, ''),
    {
      label: '2·3단계 순서 섞기',
      note: '켜면 «가 나 다» 차례를 외우지 않고 매번 다른 글자가 나옵니다. 1단계 자모는 언제나 ㄱ ㄴ ㄷ 순서입니다',
      control: () => {
        const box = document.createElement('div');
        box.className = 'ctl';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = st.randomOrder !== false;
        input.addEventListener('change', () => updateSettings({ randomOrder: input.checked }));
        box.appendChild(input);
        return box;
      },
    },
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

  // ── 백업 ────────────────────────────────────────────────
  panels.settings.insertAdjacentHTML('beforeend',
    '<h2>백업 <small>진도·스티커·친구 이름·설정을 통째로 떠 둡니다. 언제든 그때로 돌아갈 수 있습니다</small></h2>');
  const card6 = document.createElement('div');
  card6.className = 'card';

  const mkRow = document.createElement('div');
  mkRow.className = 'row';
  mkRow.innerHTML = '<div><label>지금 상태 백업</label>'
    + '<small>이름을 비워 두면 «백업2», «백업3» … 으로 붙습니다. 20개까지 보관합니다.</small></div>';
  const mkCtl = document.createElement('div');
  mkCtl.className = 'ctl';
  const mkName = document.createElement('input');
  mkName.type = 'text';
  mkName.placeholder = '백업 이름';
  mkName.maxLength = 24;
  const mkBtn = document.createElement('button');
  mkBtn.className = 'btn';
  mkBtn.textContent = '백업하기';
  mkBtn.addEventListener('click', () => {
    const n = createBackup(mkName.value);
    mkBtn.textContent = `«${n}» 저장됨`;
    setTimeout(() => again('settings'), 700);
  });
  mkCtl.append(mkName, mkBtn);
  mkRow.appendChild(mkCtl);
  card6.appendChild(mkRow);

  const backups = listBackups();
  if (!backups.length) {
    card6.insertAdjacentHTML('beforeend', '<div class="empty-note">백업이 아직 없습니다.</div>');
  } else {
    backups.forEach((bk) => {
      const row = document.createElement('div');
      row.className = 'row';
      const d = bk.data ?? {};
      // 옛 저장본은 progress.stickers 에, 새 저장본은 단계마다 들어 있다
      const got = d.progress?.stages
        ? Object.values(d.progress.stages).reduce((a, x) => a + (x.stickers?.length ?? 0), 0)
        : (d.progress?.stickers?.length ?? 0);
      const sess = d.sessions?.length ?? 0;
      row.innerHTML = `<div><label>${bk.name}</label>`
        + `<small>${when(bk.at)} · 세션 ${sess}회 · 스티커 ${got}장`
        + `${bk.note ? ` · ${bk.note}` : ''}</small></div>`;
      const ctl = document.createElement('div');
      ctl.className = 'ctl';

      const back = document.createElement('button');
      back.className = 'btn';
      back.textContent = '되돌리기';
      let armedB = false;
      back.addEventListener('click', () => {
        if (!armedB) {
          armedB = true;
          back.textContent = '한 번 더 누르면 되돌립니다';
          setTimeout(() => { armedB = false; back.textContent = '되돌리기'; }, 4000);
          return;
        }
        // 되돌리기 직전 모습도 store 가 자동으로 한 장 떠 둔다
        if (restoreBackup(bk.id)) location.reload();
      });

      const del = document.createElement('button');
      del.className = 'btn ghost';
      del.textContent = '지우기';
      let armedD = false;
      del.addEventListener('click', () => {
        if (!armedD) {
          armedD = true;
          del.textContent = '한 번 더';
          setTimeout(() => { armedD = false; del.textContent = '지우기'; }, 4000);
          return;
        }
        deleteBackup(bk.id);
        again('settings');
      });

      ctl.append(back, del);
      row.appendChild(ctl);
      card6.appendChild(row);
    });
  }
  panels.settings.appendChild(card6);

  // ── 자녀 프로필 ─────────────────────────────────────────
  panels.settings.insertAdjacentHTML('beforeend', '<h2>자녀 프로필</h2>');
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
  resetRow.innerHTML = '<div><label>진도 전체 초기화</label>'
    + '<small>세 단계의 진도·스티커·세션 기록을 모두 지웁니다. 설정·친구 이름·백업은 남습니다.'
    + ' 지우기 직전 모습이 백업으로 자동 저장됩니다</small></div>';
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
    createBackup('전체 초기화 직전');
    resetProgress();
    again('settings');
  });
  resetRow.appendChild(resetBtn);
  card5.appendChild(resetRow);
  panels.settings.appendChild(card5);

  panels.settings.insertAdjacentHTML('beforeend',
    '<div class="empty-note" style="margin-top:18px">모든 데이터는 이 기기에만 저장됩니다. 계정·서버 전송·광고·결제 없음.</div>');

  // ── 올리기 (PRD 4.2 · 10-3) ─────────────────────────────
  panels.upload.insertAdjacentHTML('beforeend', '<h2 id="voice-section">목소리 · 효과음 · 그림 올리기</h2>');
  const recHost = document.createElement('div');
  panels.upload.appendChild(recHost);
  renderRecorder(recHost);

  showTab(tab || (location.hash === '#voice' || location.hash === '#record' ? 'upload' : 'progress'));
}
