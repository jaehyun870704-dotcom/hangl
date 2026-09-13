// ============================================================
// 따라쓰기 캔버스 엔진 (PRD 5)
//  - 점선 가이드는 항상 표시 (난이도 단계 없음)
//  - 획 시작점 점 + 진행 방향 화살표
//  - 획순은 판정하지 않음: 그린 획을 남은 획 중 가장 잘 맞는 것에 배정
//  - 글자를 짧게 톡 누르면 이름 음성 재생 (획 시도로 치지 않음)
// ============================================================
import { resample, simplify, pathLength, pickStroke, dist } from './geometry.js';

const CRAYON = ['#4A9BE8', '#F2764B', '#59BE9E', '#B07BE0', '#E8A33D'];
const GUIDE = '#D9D0C2';
const BAND_FILL = 'rgba(122,91,46,0.055)';

// ── 손을 떼는 것을 곧바로 «획 하나 끝» 으로 보지 않는다 ──────
//   네 살은 한 획을 긋다 중간에 손을 떼었다 다시 짚는다.
//   바로 판정해 버리면 짧은 조각이 획으로 인정되고, 그 획이 통째로
//   칠해져서 «내가 안 그렸는데 저절로 그려졌다» 가 된다.
const LIFT_GRACE = 420;    // 이 시간 안에 다시 짚으면 같은 획을 이어 긋는 것
const LIFT_NEAR = 0.20;    // 뗀 자리에서 이만큼 안이어야 이어 긋는 것으로 본다
export const MISS_LIMIT = 3;   // 이만큼 연속으로 짧으면 그냥 인정한다 (막지 않는다 — PRD 5.3)

export function createTracer(canvas, handlers = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let box = { x0: 0, y0: 0, size: 1 };

  let jamo = null;
  let samples = [];          // 획별 resample 결과
  let results = [];          // 획별 채점 결과 (null = 미시도)
  let params = { band: 0.12, startR: 0.15 };
  let guideScale = 1;        // 재시도 시 점선을 굵게 (PRD 5.4)
  let enabled = false;

  let drawing = false;
  let pointerId = null;
  let userPath = [];         // 정규화 좌표
  let liftTimer = 0;         // 손을 뗀 뒤 판정을 미루는 타이머
  let misses = 0;            // 이 글자에서 연속으로 짧게 끝난 횟수
  let demo = null;           // { started, strokeIdx, dur }
  let raf = 0;

  // ── 레이아웃 ────────────────────────────────────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const topBar = Math.max(54, H * 0.09);
    const availH = H - topBar;
    // PRD 5.1 — 글자는 화면 짧은 변의 60% 이상
    const size = Math.min(W, availH) * 0.82;
    box = { x0: (W - size) / 2, y0: topBar + (availH - size) / 2, size };
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  window.addEventListener('resize', resize);

  const toC = (p) => [box.x0 + p[0] * box.size, box.y0 + p[1] * box.size];
  const toN = (x, y) => [(x - box.x0) / box.size, (y - box.y0) / box.size];

  // ── 그리기 ──────────────────────────────────────────────
  function strokePath(pts, { width, color, dash = null, cap = 'round', alpha = 1 }) {
    if (!pts.length) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
    ctx.beginPath();
    const p0 = toC(pts[0]);
    ctx.moveTo(p0[0], p0[1]);
    for (let i = 1; i < pts.length; i++) {
      const p = toC(pts[i]);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  function samplePts(s, from = 0, to = 1) {
    return s.filter((q) => q.t >= from && q.t <= to).map((q) => [q.x, q.y]);
  }

  function drawArrow(s) {
    const at = 0.16, ahead = 0.24;
    const a = s.find((q) => q.t >= at) || s[s.length - 1];
    const b = s.find((q) => q.t >= ahead) || s[s.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const [cx, cy] = toC([a.x, a.y]);
    const r = box.size * 0.055;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = '#8FBF6B';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.62);
    ctx.lineTo(-r * 0.7, -r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function nextStrokeIndex() {
    return results.findIndex((r) => r === null);
  }

  function draw() {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    // 바탕 종이
    ctx.save();
    ctx.fillStyle = '#FFFDF7';
    const pad = box.size * 0.12;
    roundRect(ctx, box.x0 - pad, box.y0 - pad, box.size + pad * 2, box.size + pad * 2, box.size * 0.08);
    ctx.fill();
    ctx.strokeStyle = '#F0E6D6';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 십자 보조선
    ctx.setLineDash([4, 12]);
    ctx.strokeStyle = '#F1E7D7';
    ctx.beginPath();
    ctx.moveTo(box.x0, box.y0 + box.size / 2); ctx.lineTo(box.x0 + box.size, box.y0 + box.size / 2);
    ctx.moveTo(box.x0 + box.size / 2, box.y0); ctx.lineTo(box.x0 + box.size / 2, box.y0 + box.size);
    ctx.stroke();
    ctx.restore();

    if (!jamo) return;

    const bandPx = params.band * box.size * guideScale;

    // 획 가이드
    samples.forEach((s, i) => {
      const pts = samplePts(s);
      strokePath(pts, { width: bandPx, color: BAND_FILL });
      if (results[i]) {
        strokePath(pts, { width: bandPx * 0.72, color: CRAYON[i % CRAYON.length], alpha: 0.95 });
      } else {
        strokePath(pts, {
          width: Math.max(3, box.size * 0.012 * guideScale),
          color: GUIDE,
          dash: [box.size * 0.022, box.size * 0.03],
          cap: 'round',
        });
      }
    });

    // 다음에 그릴 획 안내 (시작점 + 화살표)
    const ni = nextStrokeIndex();
    if (ni >= 0 && !demo) {
      const s = samples[ni];
      const [sx, sy] = toC([s[0].x, s[0].y]);
      const r = box.size * 0.042;
      ctx.save();
      ctx.fillStyle = 'rgba(76,184,160,.25)';
      ctx.beginPath(); ctx.arc(sx, sy, r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4CB8A0';
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawArrow(s);
    }

    // 시범 애니메이션
    if (demo) {
      const s = samples[demo.strokeIdx];
      const pts = samplePts(s, 0, demo.t);
      strokePath(pts, { width: bandPx * 0.72, color: '#9AA5B1', alpha: 0.85 });
      const head = s.find((q) => q.t >= demo.t) || s[s.length - 1];
      const [hx, hy] = toC([head.x, head.y]);
      ctx.save();
      ctx.fillStyle = '#5C6B7A';
      ctx.beginPath(); ctx.arc(hx, hy, box.size * 0.035, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 진행 중인 손가락 경로
    if (userPath.length > 1) {
      strokePath(userPath, { width: bandPx * 0.7, color: CRAYON[Math.max(ni, 0) % CRAYON.length], alpha: 0.9 });
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ── 입력 ────────────────────────────────────────────────
  function eventPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return toN(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onDown(e) {
    if (!enabled || demo) return;

    // 판정을 기다리는 중에 뗀 자리 근처를 다시 짚으면 «이어 긋기» 다.
    // 멀리 떨어진 곳을 짚으면 앞의 획을 지금 판정하고 새 획을 시작한다.
    if (liftTimer) {
      clearTimeout(liftTimer);
      liftTimer = 0;
      const p = eventPoint(e);
      const last = userPath[userPath.length - 1];
      if (last && dist(p, last) <= LIFT_NEAR) {
        drawing = true;
        pointerId = e.pointerId;
        try { canvas.setPointerCapture(pointerId); } catch {}
        userPath.push(p);
        draw();
        return;
      }
      judge();
    }

    if (drawing) return;
    drawing = true;
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(pointerId); } catch {}
    userPath = [eventPoint(e)];
    draw();
  }

  function onMove(e) {
    if (!drawing || e.pointerId !== pointerId) return;
    userPath.push(eventPoint(e));
    draw();
  }

  function onUp(e) {
    if (!drawing || e.pointerId !== pointerId) return;
    drawing = false;
    try { canvas.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
    // 바로 판정하지 않고 잠깐 기다린다 (LIFT_GRACE 설명 참고)
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => { liftTimer = 0; judge(); }, LIFT_GRACE);
  }

  /** 그린 것을 어느 획으로 볼지 정하고 채점한다 */
  function judge() {
    const path = simplify(userPath);
    userPath = [];

    // 아주 짧은 입력 = 톡 누르기 → 이름 재생 (PRD 4.2)
    if (path.length < 3 || pathLength(path) < 0.05) {
      draw();
      handlers.onTap?.();
      return;
    }

    const remaining = [];
    results.forEach((r, i) => { if (r === null) remaining.push({ index: i, samples: samples[i] }); });
    if (!remaining.length) { draw(); return; }

    const { index, result } = pickStroke(remaining, path, params);

    // 획을 끝까지 긋지 않았으면 «획 하나»로 세지 않는다.
    //   이게 없으면 살짝 스치기만 해도 그 획이 통째로 칠해지고,
    //   획 수만큼 스치면 글자가 저절로 끝나 버린다.
    //   다만 계속 막으면 아이가 갇히므로 세 번 연속이면 그냥 받아 준다.
    if (result.coverage < (params.minCover ?? 0) && misses < MISS_LIMIT) {
      misses += 1;
      draw();
      handlers.onShort?.(index, result, misses);
      return;
    }
    misses = 0;
    results[index] = result;
    draw();
    handlers.onStroke?.(index, result);

    if (results.every((r) => r !== null)) {
      const acc = results.reduce((a, r) => a + r.score, 0) / results.length;
      handlers.onComplete?.(acc, results.slice());
    }
  }


  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ── 시범 애니메이션 ─────────────────────────────────────
  function playDemo(onDone) {
    if (!jamo) return;
    cancelAnimationFrame(raf);
    let idx = 0;
    const startAt = performance.now();
    const durOf = (i) => Math.max(520, 1100 * lengthOf(samples[i]));
    demo = { strokeIdx: 0, t: 0 };

    function step(now) {
      const elapsed = now - startAt - offsetUpTo(idx);
      const d = durOf(idx);
      let t = elapsed / d;
      if (t >= 1) {
        t = 1;
        demo = { strokeIdx: idx, t: 1 };
        draw();
        idx += 1;
        if (idx >= samples.length) {
          demo = null;
          draw();
          onDone?.();
          return;
        }
      }
      demo = { strokeIdx: idx, t: Math.max(0, Math.min(1, t)) };
      draw();
      raf = requestAnimationFrame(step);
    }
    function offsetUpTo(n) {
      let o = 0;
      for (let i = 0; i < n; i++) o += durOf(i) + 160;
      return o;
    }
    function lengthOf(s) {
      let L = 0;
      for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
      return L;
    }
    raf = requestAnimationFrame(step);
  }

  // ── 외부 API ────────────────────────────────────────────
  return {
    setChar(next, opts = {}) {
      jamo = next;
      params = {
        band: opts.band ?? 0.12,
        startR: opts.startR ?? 0.15,
        minCover: opts.minCover ?? 0.6,   // 이만큼은 덮어야 «획 하나» 로 센다
      };
      guideScale = opts.guideScale ?? 1;
      samples = jamo.strokes.map((st) => resample(st, 0.006));
      results = jamo.strokes.map(() => null);
      userPath = [];
      misses = 0;
      clearTimeout(liftTimer);
      liftTimer = 0;
      demo = null;
      cancelAnimationFrame(raf);
      draw();
    },
    playDemo,
    enable(v) {
      enabled = v;
      if (!v) {
        drawing = false;
        userPath = [];
        clearTimeout(liftTimer);
        liftTimer = 0;
        draw();
      }
    },
    isBusy: () => !!demo,
    /** 글자 중심의 화면 좌표 (연출 위치용) */
    center: () => ({ x: box.x0 + box.size / 2, y: box.y0 + box.size / 2, size: box.size }),
    redraw: draw,
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(liftTimer);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    },
  };
}
