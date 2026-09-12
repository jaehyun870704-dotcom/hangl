// ============================================================
// 획 판정 기하 연산 (PRD 5.2)
//   ① 시작점 근접(25%)  ② 궤적 근접(50%)  ③ 방향 일치(25%)
//   여기에 커버리지 게이트를 곱한다 — 획을 끝까지 긋지 않으면
//   세 항목이 만점이어도 통과할 수 없다 (절반만 긋고 통과하는 것 방지)
// ============================================================

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 폴리라인 전체 길이 */
export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

/** 일정 간격으로 재샘플링. 각 점에 진행률 t(0..1) 부여 */
export function resample(pts, ds = 0.008) {
  const out = [];
  const total = pathLength(pts);
  if (total === 0) return [{ x: pts[0][0], y: pts[0][1], t: 0 }];
  let acc = 0;
  out.push({ x: pts[0][0], y: pts[0][1], t: 0 });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    if (seg === 0) continue;
    let walked = 0;
    while (walked + ds <= seg) {
      walked += ds;
      const r = walked / seg;
      acc += ds;
      out.push({ x: a[0] + (b[0] - a[0]) * r, y: a[1] + (b[1] - a[1]) * r, t: acc / total });
    }
    acc += seg - walked;
  }
  const last = pts[pts.length - 1];
  out.push({ x: last[0], y: last[1], t: 1 });
  return out;
}

/** 점 p 에서 샘플 배열까지의 최근접 거리와 진행률 */
export function nearest(samples, p) {
  let best = Infinity, bt = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const d = Math.hypot(s.x - p[0], s.y - p[1]);
    if (d < best) { best = d; bt = s.t; }
  }
  return { d: best, t: bt };
}

/** 손가락 경로 정리 — 너무 촘촘한 점 제거 */
export function simplify(pts, minGap = 0.004) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (dist(out[out.length - 1], pts[i]) >= minGap) out.push(pts[i]);
  }
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 이 비율 이상 덮으면 '끝까지 그었다'로 본다 */
const COVER_FULL = 0.85;

/**
 * 획 1개 채점
 * @param {Array} tmplSamples resample() 결과
 * @param {Array} userPts     [[x,y], ...] 정규화 좌표
 * @param {Object} p          { band, startR }
 * @returns {{score:number, start:number, path:number, dir:number, coverage:number, band:number}}
 */
export function scoreStroke(tmplSamples, userPts, p) {
  const band = p.band ?? 0.12;       // 점선 밴드 폭 (글자 크기 대비)
  const startR = p.startR ?? 0.15;   // 시작점 허용 반경
  const halfBand = band / 2;

  if (userPts.length < 2) {
    return { score: 0, start: 0, path: 0, dir: 0, coverage: 0, band: 0 };
  }

  // 손가락 경로도 같은 간격으로 재샘플링한다.
  // 그래야 점이 성기게 들어온 경우에도 커버리지·밴드 비율이 같은 기준으로 계산된다.
  const pts = resample(userPts, 0.006).map((q) => [q.x, q.y]);

  // ① 시작점 근접
  const d0 = Math.hypot(userPts[0][0] - tmplSamples[0].x, userPts[0][1] - tmplSamples[0].y);
  const startScore = d0 <= startR ? 1 : clamp01(1 - (d0 - startR) / (startR * 1.4));

  // ② 궤적 — 밴드 유지율, 커버리지
  let inBandLen = 0, totalLen = 0;
  const tHits = new Array(tmplSamples.length).fill(false);
  const marks = [];   // { cum, t } — 방향 판정용

  for (let i = 0; i < pts.length; i++) {
    const near = nearest(tmplSamples, pts[i]);
    const segLen = i === 0 ? 0 : dist(pts[i - 1], pts[i]);
    totalLen += segLen;
    if (near.d <= halfBand) {
      inBandLen += segLen;
      // 커버리지: 밴드 안에 있을 때만 템플릿 구간을 덮은 것으로 인정
      const idx = Math.round(near.t * (tmplSamples.length - 1));
      for (let k = Math.max(0, idx - 1); k <= Math.min(tmplSamples.length - 1, idx + 1); k++) tHits[k] = true;
    }
    marks.push({ cum: totalLen, t: near.t });
  }

  const bandRatio = totalLen > 0 ? inBandLen / totalLen : 0;   // ② 궤적 근접
  const coverage = tHits.filter(Boolean).length / tHits.length;

  // ③ 방향 일치 — 점 하나하나가 아니라 경로를 등간격 구간으로 나눠 비교한다.
  //    4세의 손떨림은 점 단위로 앞뒤로 흔들리므로, 인접 점 비교는 방향을 오판한다.
  const K = 16;
  let fwd = 0, steps = 0;
  if (totalLen > 0 && marks.length > 1) {
    const tAt = (target) => {
      let lo = 0;
      for (let i = 1; i < marks.length; i++) { if (marks[i].cum <= target) lo = i; else break; }
      return marks[lo].t;
    };
    let prev = tAt(0);
    for (let k = 1; k <= K; k++) {
      const t = tAt((totalLen * k) / K);
      if (t >= prev - 0.02) fwd += 1;
      steps += 1;
      prev = t;
    }
  }
  const fwdRatio = steps > 0 ? fwd / steps : 0;
  // 0.45 이하는 사실상 역방향, 0.9 이상은 만점
  const dirScore = clamp01((fwdRatio - 0.45) / 0.45);

  // 획을 끝까지 그었는지 — 시작 부근만 문지르고 통과하는 것을 막는 게이트
  const done = Math.pow(Math.min(1, coverage / COVER_FULL), 1.5);

  const base = 0.25 * startScore + 0.5 * bandRatio + 0.25 * dirScore;
  const score = clamp01(base * done);
  return { score, start: startScore, path: bandRatio, dir: dirScore, coverage, band: bandRatio };
}

/** 여러 후보 획 중 이 입력이 어느 획을 그린 것인지 고른다 (획순 미판정 — PRD 5.2) */
export function pickStroke(candidates, userPts, params) {
  let bestIdx = -1, bestScore = -1, bestResult = null;
  for (const { index, samples } of candidates) {
    const r = scoreStroke(samples, userPts, params);
    // 채점 점수 + 시작점 거리로 소속을 판단
    const affinity = r.score + 0.35 * r.coverage;
    if (affinity > bestScore) { bestScore = affinity; bestIdx = index; bestResult = r; }
  }
  return { index: bestIdx, result: bestResult };
}
