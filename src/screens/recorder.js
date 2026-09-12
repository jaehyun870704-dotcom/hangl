// ============================================================
// 성우 녹음 화면 (부모 메뉴 안)
//  · 문구를 하나씩 보여주고 그 자리에서 녹음한다
//  · 녹음한 소리는 즉시 앱 전체에 반영된다 (audio.js 재생 1순위)
//  · wav 묶음으로 내보내 assets/audio 에 넣으면 다른 기기에서도 재생된다
// ============================================================
import { voiceCatalog, scriptText } from '../lines.js';
import { loadStickerMeta } from '../stickers.js';
import { SFX_SLOTS, SFX_PRESETS, previewSfx } from '../audio.js';
import { state, updateSettings } from '../store.js';
import {
  canRecord, openMic, closeMic, startRecording,
  saveClip, deleteClip, clearClips, hasClip, clipCount, recordedUrl,
  exportVoicePack, downloadBlob,
  decodeAudio, toMono, detectSegments, sliceToWav,
} from '../voicebank.js';

const MAX_SEC = 8;
const SOURCE_DIR = 'assets/audio/source/';
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * assets/audio 에 들어 있는 파일 목록 (index.json).
 * 파일로 넣어 둔 음성도 "사람 목소리"로 세기 위해 읽는다.
 */
async function loadFileIndex() {
  try {
    const r = await fetch('assets/audio/index.json', { cache: 'no-cache' });
    if (!r.ok) return new Map();
    const list = await r.json();
    return new Map(list.map((n) => [n.replace(/\.[a-z0-9]+$/i, ''), n]));
  } catch {
    return new Map();
  }
}

export async function renderRecorder(host, { onChange } = {}) {
  await loadStickerMeta();        // 캐릭터 이름을 다 읽은 뒤에 목록을 만든다
  const fileKeys = await loadFileIndex();
  const groups = voiceCatalog();
  const flat = groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
  /** 녹음(기기 안) 이거나 파일(assets/audio) 이면 사람 목소리가 있는 것 */
  const hasVoice = (key) => hasClip(key) || fileKeys.has(key);

  host.innerHTML = '';
  const secure = window.isSecureContext;
  const able = canRecord() && secure;

  // ── 요약 카드 ───────────────────────────────────────────
  const head = document.createElement('div');
  head.className = 'card';
  head.innerHTML = `
    <div class="status" id="rec-status"></div>
    <div class="row">
      <div>
        <label>녹음한 음성 <b id="rec-count">${clipCount()}</b> / ${flat.length}</label>
        <small>녹음하면 그 즉시 아이 화면에 반영됩니다. 녹음이 없는 문구는 기계음(TTS)으로 읽습니다.</small>
      </div>
      <div class="ctl">
        <label class="tiny"><input type="checkbox" id="rec-filter"> 기계음인 것만 보기</label>
        <button class="btn" id="rec-start" ${able ? '' : 'disabled'}>이어서 녹음하기</button>
      </div>
    </div>
    <div class="row">
      <div>
        <label>녹음 대본 받기</label>
        <small>성우에게 건넬 대본입니다. 문구 ${flat.length}개와 발음·녹음 요령이 들어 있습니다.
          이대로 한 번에 쭉 읽어 오시면 위의 «긴 녹음 파일에서 가져오기»로 한 번에 배정됩니다.</small>
      </div>
      <div class="ctl"><button class="btn ghost" id="rec-script">대본 내려받기</button></div>
    </div>
    <div class="row">
      <div>
        <label>녹음된 목소리만 재생</label>
        <small>켜면 녹음이 없는 문구는 <b>기계음으로 읽지 않고 조용히 넘어갑니다.</b>
          아이에게 사람 목소리만 들려주고 싶을 때 켜세요.</small>
      </div>
      <div class="ctl">
        <span class="tiny" id="rec-silent"></span>
        <input type="checkbox" id="rec-onlyrec" ${state.settings.onlyRecordedVoice ? 'checked' : ''}>
      </div>
    </div>
    <div class="row">
      <div>
        <label>음성 파일 내보내기</label>
        <small>wav 묶음(zip)을 받아 <code>assets/audio</code> 에 풀어 넣으면 태블릿에서도 이 목소리로 재생됩니다.</small>
      </div>
      <div class="ctl">
        <button class="btn ghost" id="rec-export">내보내기</button>
        <button class="btn ghost" id="rec-clear">전체 지우기</button>
      </div>
    </div>
    <div class="row">
      <div>
        <label>확인하며 듣기</label>
        <small>저장된 음성을 문구 순서대로 들려줍니다. 엉뚱한 자리에 들어간 소리를 찾을 때 쓰세요.</small>
      </div>
      <div class="ctl">
        <span id="rec-now" class="tiny"></span>
        <button class="btn ghost" id="rec-review">순서대로 듣기</button>
      </div>
    </div>
    ${able ? '' : `<div class="warn">${
      !canRecord() ? '이 브라우저에서는 녹음을 지원하지 않습니다.'
        : '마이크는 보안 연결에서만 열립니다. <b>PC에서 http://localhost 로 접속해 녹음</b>한 뒤, 내보낸 파일을 assets/audio 에 넣으세요.'
    }</div>`}`;
  host.appendChild(head);

  const countEl = head.querySelector('#rec-count');
  const statusEl = head.querySelector('#rec-status');
  const silentEl = head.querySelector('#rec-silent');

  function refreshCount() {
    const own = flat.filter((it) => hasVoice(it.key)).length;
    const rest = flat.length - own;
    countEl.textContent = own;
    statusEl.className = `status ${own === flat.length ? 'ok' : own ? 'part' : 'none'}`;
    statusEl.innerHTML = own === flat.length
      ? `지금 아이가 듣는 소리: <b>${flat.length}개 모두 사람 목소리</b>입니다.`
      : `지금 아이가 듣는 소리: 사람 목소리 <b>${own}개</b> · 기계음 <b>${rest}개</b>.` +
        (own === 0 ? ' 아직 한 개도 넣지 않아 <b>전부 기계음</b>으로 읽고 있습니다.' : '');
    silentEl.textContent = state.settings.onlyRecordedVoice && rest
      ? `${rest}개 문구는 소리가 나지 않습니다` : '';
    onChange?.();
  }

  head.querySelector('#rec-script').addEventListener('click', () => {
    // 메모장에서 한글이 깨지지 않도록 BOM 을 붙인다
    const blob = new Blob(['﻿' + scriptText()], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, '녹음-대본.txt');
  });

  head.querySelector('#rec-onlyrec').addEventListener('change', (e) => {
    updateSettings({ onlyRecordedVoice: e.target.checked });
    refreshCount();
  });

  head.querySelector('#rec-filter').addEventListener('change', (e) => {
    const only = e.target.checked;
    rowsByKey.forEach((row, key) => { row.hidden = only && hasVoice(key); });
  });

  // ── 긴 녹음 파일 나누기 ─────────────────────────────────
  const split = document.createElement('div');
  split.className = 'card';
  split.innerHTML = `
    <div class="row">
      <div>
        <label>긴 녹음 파일에서 가져오기</label>
        <small>한 번에 쭉 읽은 파일을 무음 기준으로 잘라 문구에 하나씩 배정합니다.
          구간을 <b>들어보고</b> 어떤 문구인지 고르세요. 고르는 즉시 저장됩니다.</small>
      </div>
      <div class="ctl">
        <select id="sp-source"><option value="">불러올 파일…</option></select>
        <button class="btn ghost" id="sp-pick">내 파일 고르기</button>
        <input type="file" id="sp-file" accept="audio/*" hidden>
      </div>
    </div>
    <div id="sp-body" hidden>
      <div class="row">
        <div><label id="sp-info"></label><small id="sp-hint"></small></div>
        <div class="ctl">
          <label class="tiny">민감도</label>
          <input type="range" id="sp-th" min="-50" max="-20" step="1" value="-35">
          <label class="tiny">끊는 간격</label>
          <input type="range" id="sp-gap" min="0.15" max="0.8" step="0.05" value="0.3">
          <button class="btn ghost" id="sp-redo">다시 나누기</button>
        </div>
      </div>
      <div class="row">
        <div>
          <label>순서대로 채우기</label>
          <small>구간이 문구 순서대로 읽혀 있을 때만 쓰세요. 채운 뒤 <b>반드시 들어보고</b> 틀린 것을 고치세요.</small>
        </div>
        <div class="ctl">
          <select id="sp-from"></select>
          <button class="btn ghost" id="sp-auto">순서대로 채우기</button>
        </div>
      </div>
      <div id="sp-list" class="seg-list"></div>
    </div>`;
  host.appendChild(split);

  const $s = (sel) => split.querySelector(sel);
  let buffer = null, mono = null, segs = [];

  // 준비된 파일 목록
  fetch(`${SOURCE_DIR}sources.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => {
      (Array.isArray(list) ? list : []).forEach((it) => {
        const o = document.createElement('option');
        o.value = SOURCE_DIR + it.file;
        o.textContent = it.title || it.file;
        $s('#sp-source').appendChild(o);
      });
    })
    .catch(() => {});

  $s('#sp-source').addEventListener('change', (e) => {
    if (e.target.value) loadAudio(encodeURI(e.target.value), e.target.selectedOptions[0].textContent);
  });
  $s('#sp-pick').addEventListener('click', () => $s('#sp-file').click());
  $s('#sp-file').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) loadAudio(f, f.name);
  });

  async function loadAudio(src, title) {
    $s('#sp-body').hidden = false;
    $s('#sp-info').textContent = '읽는 중…';
    $s('#sp-list').innerHTML = '';
    try {
      buffer = await decodeAudio(src);
      mono = toMono(buffer);
      $s('#sp-info').textContent = `${title} · ${mmss(buffer.duration)}`;
      resplit();
    } catch (err) {
      console.warn(err);
      $s('#sp-info').textContent = '이 파일을 읽지 못했습니다.';
      $s('#sp-hint').textContent = 'mp3 · m4a · wav 파일을 넣어 주세요.';
    }
  }

  function resplit() {
    if (!mono) return;
    segs = detectSegments(mono, buffer.sampleRate, {
      thresholdDb: Number($s('#sp-th').value),
      minGap: Number($s('#sp-gap').value),
    });
    $s('#sp-hint').textContent =
      `구간 ${segs.length}개 · 문구는 ${flat.length}개입니다. 구간이 너무 적으면 «끊는 간격»을 줄여 보세요.`;
    paintSegments();
  }
  $s('#sp-redo').addEventListener('click', resplit);
  ['#sp-th', '#sp-gap'].forEach((s) => $s(s).addEventListener('change', resplit));

  function lineSelect(selected) {
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="">— 어떤 문구인가요 —</option>';
    groups.forEach((g) => {
      const og = document.createElement('optgroup');
      og.label = g.group;
      g.items.forEach((it) => {
        const o = document.createElement('option');
        o.value = it.key;
        o.textContent = `${hasClip(it.key) ? '● ' : ''}${it.text}${it.label && it.label !== it.text ? ` (${it.label})` : ''}`;
        if (it.key === selected) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    return sel;
  }

  // 한 구간 안에 여러 낱말이 뭉쳐 있을 때 그 구간만 더 잘게 쪼갠다
  function splitOne(i) {
    const sg = segs[i];
    const rate = buffer.sampleRate;
    const a = Math.max(0, Math.floor(sg.start * rate));
    const b = Math.min(mono.length, Math.ceil(sg.end * rate));
    const sub = detectSegments(mono.subarray(a, b), rate, {
      thresholdDb: Number($s('#sp-th').value) + 8,   // 더 큰 소리만 말소리로 → 사이가 벌어짐
      minGap: 0.12,
      minLen: 0.15,
      pad: 0.04,
    });
    if (sub.length > 1) {
      segs.splice(i, 1, ...sub.map((s) => ({ start: sg.start + s.start, end: sg.start + s.end })));
      paintSegments();
    } else {
      $s('#sp-hint').textContent = '이 구간은 더 나뉘지 않습니다. «민감도»를 올린 뒤 다시 해보세요.';
    }
  }

  // 순서대로 채우기
  const fromSel = $s('#sp-from');
  flat.forEach((it, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i + 1}. ${it.text}`;
    fromSel.appendChild(o);
  });
  let autoArmed = false;
  $s('#sp-auto').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!segs.length) return;
    if (!autoArmed) {
      autoArmed = true;
      btn.textContent = `한 번 더 누르면 ${segs.length}개 배정`;
      setTimeout(() => { autoArmed = false; btn.textContent = '순서대로 채우기'; }, 4000);
      return;
    }
    autoArmed = false;
    btn.disabled = true;
    const from = Number(fromSel.value || 0);
    for (let i = 0; i < segs.length && from + i < flat.length; i++) {
      btn.textContent = `배정 중… ${i + 1}/${segs.length}`;
      await saveClip(flat[from + i].key, sliceToWav(buffer, segs[i].start, segs[i].end));
      paint(flat[from + i].key);
    }
    refreshCount();
    paintSegments(from);
    btn.textContent = '순서대로 채우기';
    btn.disabled = false;
  });

  function paintSegments(assignFrom = -1) {
    const list = $s('#sp-list');
    list.innerHTML = '';
    segs.forEach((sg, i) => {
      const row = document.createElement('div');
      row.className = 'seg-row';
      row.innerHTML = `
        <span class="seg-no">${i + 1}</span>
        <span class="seg-time">${mmss(sg.start)} · ${(sg.end - sg.start).toFixed(1)}초</span>
        <span class="seg-play">
          <button class="mini" data-act="hear">▶ 듣기</button>
          <button class="mini" data-act="cut">쪼개기</button>
        </span>`;
      const assigned = assignFrom >= 0 && assignFrom + i < flat.length ? flat[assignFrom + i].key : null;
      const cell = document.createElement('span');
      cell.className = 'seg-assign';
      const sel = lineSelect(assigned);
      cell.appendChild(sel);
      const mark = document.createElement('span');
      mark.className = 'seg-mark';
      if (assigned) { mark.textContent = '✓ 저장됨'; row.classList.add('assigned'); }
      cell.appendChild(mark);
      row.appendChild(cell);
      list.appendChild(row);

      row.querySelector('[data-act=hear]').addEventListener('click', () => {
        const url = URL.createObjectURL(sliceToWav(buffer, sg.start, sg.end));
        const el = new Audio(url);
        el.onended = () => URL.revokeObjectURL(url);
        el.play().catch(() => {});
      });
      row.querySelector('[data-act=cut]').addEventListener('click', () => splitOne(i));

      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        mark.textContent = '저장 중…';
        await saveClip(sel.value, sliceToWav(buffer, sg.start, sg.end));
        paint(sel.value);
        refreshCount();
        mark.textContent = '✓ 저장됨';
        row.classList.add('assigned');
      });
    });
  }

  // ── 문구 목록 ───────────────────────────────────────────
  const rowsByKey = new Map();
  groups.forEach((g) => {
    host.insertAdjacentHTML('beforeend', `<h3 class="rec-group">${g.group} <small>${g.note}</small></h3>`);
    const card = document.createElement('div');
    card.className = 'card rec-list';
    g.items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'rec-row';
      row.innerHTML = `
        <span class="rec-label">${it.label ?? ''}</span>
        <span class="rec-text">${it.text}${it.pron ? ` <em class="pron">[${it.pron}]</em>` : ''}</span>
        <span class="rec-state"></span>
        <span class="rec-actions">
          <button class="mini" data-act="rec">녹음</button>
          <button class="mini" data-act="play">듣기</button>
          <button class="mini" data-act="del">삭제</button>
        </span>`;
      card.appendChild(row);
      rowsByKey.set(it.key, row);

      row.querySelector('[data-act=rec]').addEventListener('click', () => openStudio(flat.findIndex((f) => f.key === it.key)));
      row.querySelector('[data-act=play]').addEventListener('click', () => {
        const url = recordedUrl(it.key)
          || (fileKeys.has(it.key) ? `assets/audio/${fileKeys.get(it.key)}` : null);
        if (url) new Audio(url).play().catch(() => {});
      });
      row.querySelector('[data-act=del]').addEventListener('click', async () => {
        await deleteClip(it.key);
        paint(it.key);
        refreshCount();
      });
    });
    host.appendChild(card);
  });

  function paint(key) {
    const row = rowsByKey.get(key);
    if (!row) return;
    const rec = hasClip(key);
    const file = fileKeys.has(key);
    row.classList.toggle('got', rec || file);
    row.querySelector('.rec-state').textContent =
      rec ? '● 녹음됨' : file ? '● 파일' : '○ 기계음';
    row.querySelector('[data-act=play]').disabled = !(rec || file);
    row.querySelector('[data-act=del]').disabled = !rec;      // 파일은 여기서 지우지 않는다
  }
  flat.forEach((it) => paint(it.key));
  refreshCount();          // 첫 화면에서도 상태를 바로 보여준다

  head.querySelector('#rec-start').addEventListener('click', () => {
    const next = flat.findIndex((it) => !hasClip(it.key));
    openStudio(next < 0 ? 0 : next);
  });

  head.querySelector('#rec-export').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!clipCount()) { btn.textContent = '녹음이 없습니다'; setTimeout(() => { btn.textContent = '내보내기'; }, 1600); return; }
    btn.disabled = true; btn.textContent = '만드는 중…';
    try {
      const zip = await exportVoicePack();
      if (zip) downloadBlob(zip, '목소리-모음.zip');
      btn.textContent = '내보내기';
    } catch (err) {
      console.warn(err);
      btn.textContent = '실패';
      setTimeout(() => { btn.textContent = '내보내기'; }, 1600);
    }
    btn.disabled = false;
  });

  let armed = false;
  head.querySelector('#rec-clear').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!armed) {
      armed = true;
      btn.textContent = '한 번 더 누르면 삭제';
      setTimeout(() => { armed = false; btn.textContent = '전체 지우기'; }, 4000);
      return;
    }
    await clearClips();
    flat.forEach((it) => paint(it.key));
    refreshCount();
    btn.textContent = '전체 지우기';
    armed = false;
  });

  // ── 확인하며 듣기 ───────────────────────────────────────
  let review = null;
  const nowEl = head.querySelector('#rec-now');
  head.querySelector('#rec-review').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (review) { review.stop(); return; }
    const items = flat.filter((it) => hasVoice(it.key));
    if (!items.length) { nowEl.textContent = '저장된 음성이 없습니다'; return; }
    let i = 0;
    let el = null;
    btn.textContent = '멈춤';
    const stop = () => {
      el?.pause();
      review = null;
      nowEl.textContent = '';
      btn.textContent = '순서대로 듣기';
      rowsByKey.forEach((r) => r.classList.remove('playing'));
    };
    const step = () => {
      if (i >= items.length) { stop(); return; }
      const it = items[i];
      rowsByKey.forEach((r) => r.classList.remove('playing'));
      const row = rowsByKey.get(it.key);
      row?.classList.add('playing');
      row?.scrollIntoView({ block: 'nearest' });
      nowEl.textContent = `${i + 1}/${items.length} · ${it.text}`;
      el = new Audio(recordedUrl(it.key)
        || `assets/audio/${fileKeys.get(it.key)}`);
      el.onended = () => { i += 1; setTimeout(step, 350); };
      el.onerror = () => { i += 1; setTimeout(step, 100); };
      el.play().catch(() => { i += 1; setTimeout(step, 100); });
    };
    review = { stop };
    step();
  });

  // ── 효과음 바꾸기 ───────────────────────────────────────
  host.insertAdjacentHTML('beforeend',
    '<h3 class="rec-group">효과음 <small>기본 소리는 코드로 만든 것입니다. 가지고 있는 소리 파일로 바꿀 수 있습니다.</small></h3>');
  const sfxCard = document.createElement('div');
  sfxCard.className = 'card rec-list';
  SFX_SLOTS.forEach((slot) => {
    const row = document.createElement('div');
    row.className = 'rec-row';
    row.innerHTML = `
      <span class="rec-label">♪</span>
      <span class="rec-text">${slot.label}</span>
      <span class="rec-state"></span>
      <span class="rec-actions">
        <button class="mini" data-act="hear">듣기</button>
        <button class="mini" data-act="pick">파일</button>
        <button class="mini" data-act="reset">기본</button>
        <input type="file" accept="audio/*" hidden>
      </span>`;

    // 기본 소리가 여러 개면 고를 수 있게
    const presets = SFX_PRESETS[slot.key] ?? [];
    if (presets.length > 1) {
      const sel = document.createElement('select');
      sel.className = 'preset';
      presets.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = p.name;
        if (Number(state.settings.sfxPreset?.[slot.key] ?? 0) === i) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        updateSettings({ sfxPreset: { ...state.settings.sfxPreset, [slot.key]: Number(sel.value) } });
        previewSfx(slot.key, Number(sel.value));
      });
      row.querySelector('.rec-state').after(sel);
      row.classList.add('with-preset');
    }
    sfxCard.appendChild(row);

    const file = row.querySelector('input[type=file]');
    const mark = () => {
      const own = hasClip(slot.key);
      row.classList.toggle('got', own);
      row.querySelector('.rec-state').textContent = own ? '● 내 파일' : '○ 기본 소리';
      row.querySelector('[data-act=reset]').disabled = !own;
    };
    row.querySelector('[data-act=hear]').addEventListener('click', () => previewSfx(slot.key));
    row.querySelector('[data-act=pick]').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      await saveClip(slot.key, f);
      mark();
      previewSfx(slot.key);
    });
    row.querySelector('[data-act=reset]').addEventListener('click', async () => {
      await deleteClip(slot.key);
      mark();
      previewSfx(slot.key);
    });
    mark();
  });
  host.appendChild(sfxCard);
  host.insertAdjacentHTML('beforeend',
    '<div class="warn">남이 만든 소리(만화·게임 효과음 등)를 넣을 때는 가정 내 사용에 그치세요. ' +
    '앱을 공개하거나 공유하려면 직접 만든 소리나 사용이 허락된 소리여야 합니다.</div>');

  // ── 녹음 스튜디오 (한 문구씩) ────────────────────────────
  function openStudio(startIndex) {
    let i = Math.max(0, startIndex);
    let rec = null;         // 녹음 핸들
    let timer = null;
    let meterRaf = 0;
    let analyser = null;
    let audioCtx = null;

    const modal = document.createElement('div');
    modal.className = 'studio';
    modal.innerHTML = `
      <div class="studio-box">
        <div class="studio-top">
          <span id="st-pos"></span>
          <label class="auto"><input type="checkbox" id="st-auto" checked> 녹음 후 자동으로 다음</label>
          <button class="btn ghost" id="st-close">닫기</button>
        </div>
        <div class="studio-group" id="st-group"></div>
        <div class="studio-line" id="st-line"></div>
        <div class="studio-pron" id="st-pron"></div>
        <div class="studio-label" id="st-label"></div>
        <div class="meter"><i id="st-meter"></i></div>
        <div class="studio-actions">
          <button class="btn big" id="st-rec">● 녹음 시작</button>
          <button class="btn ghost" id="st-play">▶ 듣기</button>
          <button class="btn ghost" id="st-prev">← 이전</button>
          <button class="btn ghost" id="st-next">다음 →</button>
        </div>
        <div class="studio-hint">스페이스바로도 녹음을 시작하고 멈출 수 있습니다.</div>
      </div>`;
    document.body.appendChild(modal);

    const $ = (id) => modal.querySelector(id);
    const btnRec = $('#st-rec'), btnPlay = $('#st-play'), meter = $('#st-meter');

    function show() {
      const it = flat[i];
      $('#st-pos').textContent = `${i + 1} / ${flat.length} · 녹음 ${clipCount()}개`;
      $('#st-group').textContent = it.group;
      $('#st-line').textContent = it.text;
      $('#st-pron').textContent = it.pron ? `이렇게 소리 냅니다 → [${it.pron}]` : '';
      $('#st-label').textContent = it.label ? `(${it.label})` : '';
      btnPlay.disabled = !hasClip(it.key);
      btnRec.textContent = hasClip(it.key) ? '● 다시 녹음' : '● 녹음 시작';
      modal.classList.toggle('done', hasClip(it.key));
    }

    async function startMeter() {
      try {
        const stream = await openMic();
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        audioCtx.resume?.().catch(() => {});
        modal.addEventListener('pointerdown', () => audioCtx?.resume?.().catch(() => {}), { once: true });
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let k = 0; k < buf.length; k++) peak = Math.max(peak, Math.abs(buf[k] - 128) / 128);
          meter.style.width = `${Math.min(100, peak * 180)}%`;
          meterRaf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        $('#st-line').insertAdjacentHTML('afterend',
          '<div class="warn">마이크를 열지 못했습니다. 브라우저의 마이크 권한을 확인해 주세요.</div>');
      }
    }

    async function toggleRecord() {
      if (rec) {
        clearTimeout(timer);
        const blob = await rec.stop();
        rec = null;
        btnRec.classList.remove('recording');
        await saveClip(flat[i].key, blob);
        paint(flat[i].key);
        refreshCount();
        show();
        const url = recordedUrl(flat[i].key);
        if (url) {
          const el = new Audio(url);
          el.onended = () => { if ($('#st-auto').checked) setTimeout(nextItem, 500); };
          el.play().catch(() => { if ($('#st-auto').checked) setTimeout(nextItem, 700); });
        }
        return;
      }
      try {
        rec = await startRecording();
        btnRec.classList.add('recording');
        btnRec.textContent = '■ 멈춤';
        timer = setTimeout(() => { if (rec) toggleRecord(); }, MAX_SEC * 1000);
      } catch (e) {
        btnRec.textContent = '마이크 실패';
      }
    }

    const nextItem = () => { if (i < flat.length - 1) { i += 1; show(); } else show(); };
    const prevItem = () => { if (i > 0) { i -= 1; show(); } };

    btnRec.addEventListener('click', toggleRecord);
    btnPlay.addEventListener('click', () => {
      const url = recordedUrl(flat[i].key);
      if (url) new Audio(url).play().catch(() => {});
    });
    $('#st-next').addEventListener('click', nextItem);
    $('#st-prev').addEventListener('click', prevItem);
    $('#st-close').addEventListener('click', close);

    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); toggleRecord(); }
      if (e.code === 'Escape') close();
      if (e.code === 'ArrowRight') nextItem();
      if (e.code === 'ArrowLeft') prevItem();
    };
    window.addEventListener('keydown', onKey);

    function close() {
      cancelAnimationFrame(meterRaf);
      clearTimeout(timer);
      rec?.cancel();
      audioCtx?.close?.();
      closeMic();
      window.removeEventListener('keydown', onKey);
      modal.remove();
    }

    show();
    startMeter();
  }
}
