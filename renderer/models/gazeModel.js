// Where the person looks, from a webcam (spec/004-hands-free-control.md, gaze calibration v2). Pure math over
// what the face service passes per frame: the face mesh points, 10 blendshapes and the head's pose matrix.
//   · A vector per frame: each open iris inside its eye (along the corners and against the lids' middle), how
//     open the lids are, MediaPipe's own gaze guess (eyeLook*), and the head's turn and position.
//   · The calibration: 9 points from edge to edge (in an order without long jumps), a moment looking at the
//     center while the head moves a little (so the model learns what the head does), and 4 test points.
//     Every frame of each fixation counts, after the eyes had time to get there; outlier frames are dropped.
//   · The model: ridge regression per axis on the standardized vector, linear or with a few squared eye
//     terms; the kind and the regularization are chosen leaving one point out. A calibration whose result
//     goes against MediaPipe's own guess (mirrored) is rejected.
//   · While pointing: a One Euro filter (calm while still, quick on a jump), a hold that keeps the cursor still
//     while the eyes fixate, and an affine correction learned from each confirmed selection.
// Only the model's numbers are ever kept (models/handsFreeSettings.js); vectors and samples live in memory.
import { FACE_POINTS as P } from './faceGesture.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const deg = (r) => (r * 180) / Math.PI;
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const EYE_CLOSED = 0.5; // a blink blendshape above this: that eye is closed
const POSITION_EYES = 0.4; // to start a calibration the eyes must be open wider than this

// ---------- The head and MediaPipe's own guess ----------

// MediaPipe's facial transformation matrix (4×4, column-major) -> yaw (turn), pitch (nod), roll (tilt) in
// degrees and the translation
export function headPose(m) {
  if (!m || m.length !== 16 || ![...m].every(Number.isFinite)) return null;
  const R = (r, c) => m[c * 4 + r];
  return {
    yaw: deg(Math.atan2(-R(2, 0), Math.hypot(R(2, 1), R(2, 2)))),
    pitch: deg(Math.atan2(R(2, 1), R(2, 2))),
    roll: deg(Math.atan2(R(1, 0), R(0, 0))),
    tx: m[12], ty: m[13], tz: m[14],
  };
}

// The eyeLook* blendshapes (per the person's eyes) -> x > 0 is the person's right, y > 0 is up
export function lookOf(e = {}) {
  const v = (k) => e?.[k] ?? 0;
  return {
    x: (v('eyeLookInLeft') + v('eyeLookOutRight') - v('eyeLookOutLeft') - v('eyeLookInRight')) / 2,
    y: (v('eyeLookUpLeft') + v('eyeLookUpRight') - v('eyeLookDownLeft') - v('eyeLookDownRight')) / 2,
  };
}

// ---------- One vector per frame ----------

const EYES = {
  right: { a: P.rightOuter, b: P.rightInner, up: P.rightUpper, down: P.rightLower, iris: P.rightIris },
  left: { a: P.leftInner, b: P.leftOuter, up: P.leftUpper, down: P.leftLower, iris: P.leftIris },
};

// One eye: the iris along its corners (0..1 from the image-left corner), its offset from the lids' middle and
// how open the lids are, both in eye widths
function eye(l, side) {
  const s = EYES[side];
  const a = l[s.a], b = l[s.b], up = l[s.up], down = l[s.down], iris = l[s.iris];
  if (!a || !b || !up || !down || !iris) return null;
  const ex = b.x - a.x, ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  if (!len2) return null;
  const mid = { x: (up.x + down.x) / 2, y: (up.y + down.y) / 2 };
  return {
    x: ((iris.x - a.x) * ex + (iris.y - a.y) * ey) / len2,
    y: ((iris.x - mid.x) * -ey + (iris.y - mid.y) * ex) / len2,
    open: Math.hypot(down.x - up.x, down.y - up.y) / Math.sqrt(len2),
  };
}

export const FEATURES = ['irisX', 'irisY', 'lids', 'lookX', 'lookY', 'yaw', 'pitch', 'headX', 'headY', 'headZ'];
export const FEATURE_COUNT = FEATURES.length;
const KEY_FEATURES = [0, 1, 3, 4]; // the ones that say where the eyes point (outliers are judged on these)

// face: { landmarks, blendshapes, matrix } -> number[FEATURE_COUNT], or null (no face, both eyes closed)
export function gazeVector(face) {
  if (!face?.landmarks) return null;
  const b = face.blendshapes ?? {};
  const eyes = [];
  if ((b.eyeBlinkRight ?? 0) < EYE_CLOSED) eyes.push(eye(face.landmarks, 'right'));
  if ((b.eyeBlinkLeft ?? 0) < EYE_CLOSED) eyes.push(eye(face.landmarks, 'left'));
  const open = eyes.filter(Boolean);
  if (!open.length) return null;
  const avg = (k) => open.reduce((s, e) => s + e[k], 0) / open.length;
  const look = lookOf(b);
  const pose = headPose(face.matrix);
  const nose = face.landmarks[P.noseTip];
  // Without the matrix, the nose's place stands in for the head's (degrees / 10 and cm keep similar scales)
  const head = pose
    ? [pose.yaw / 10, pose.pitch / 10, pose.tx, pose.ty, pose.tz / 10]
    : [0, 0, (nose?.x ?? 0.5) * 60, (nose?.y ?? 0.5) * 45, 0];
  return [avg('x'), avg('y'), avg('open'), look.x, look.y, ...head];
}

// ---------- Where the points go ----------

const X3 = [0.06, 0.5, 0.94], Y3 = [0.08, 0.5, 0.92];
// 9 points from edge to edge, row by row in a snake (no long jumps), and 4 test points around the middle
export const CALIBRATION_POINTS = [
  ...X3.map((x) => ({ x, y: Y3[0] })),
  ...[...X3].reverse().map((x) => ({ x, y: Y3[1] })),
  ...X3.map((x) => ({ x, y: Y3[2] })),
];
export const TEST_POINTS = [{ x: 0.28, y: 0.28 }, { x: 0.72, y: 0.28 }, { x: 0.72, y: 0.72 }, { x: 0.28, y: 0.72 }];
export const CENTER = { x: 0.5, y: 0.5 };

// ---------- Taking a fixation ----------

const SETTLE_MS = 900; // the dot glides to its place and the eyes follow (a saccade arrives 300-600 ms late)
const COLLECT_MS = 1000; // then every frame of this long counts
const MAX_COLLECT_MS = 2500; // up to this long if too many frames were blinks or outliers
const HEAD_MS = 4000; // the center while the head moves a little
const MIN_FRAMES = 8;

// Frames far from the others (3 robust deviations on any key feature) are dropped
function dropOutliers(frames) {
  if (frames.length < 4) return frames;
  const limits = KEY_FEATURES.map((j) => {
    const values = frames.map((f) => f[j]);
    const m = median(values);
    const mad = median(values.map((v) => Math.abs(v - m))) * 1.4826;
    return { j, m, mad };
  });
  return frames.filter((f) => limits.every(({ j, m, mad }) => mad < 1e-9 || Math.abs(f[j] - m) <= 3 * mad));
}

// update(vector | null, now) -> { progress 0..1, done: { vectors, dropped, gaveUp } | null }
export class FixationSampler {
  #start = null;
  #frames = [];
  #o;

  constructor({ settleMs = SETTLE_MS, collectMs = COLLECT_MS, maxMs = MAX_COLLECT_MS, robust = true } = {}) {
    this.#o = { settleMs, collectMs, maxMs, robust };
  }

  update(v, now) {
    const o = this.#o;
    this.#start ??= now;
    const elapsed = now - this.#start;
    if (elapsed < o.settleMs) return { progress: 0, done: null };
    if (v) this.#frames.push(v);
    const collecting = elapsed - o.settleMs;
    const progress = Math.min(1, collecting / o.collectMs);
    if (collecting < o.collectMs) return { progress, done: null };
    const kept = o.robust ? dropOutliers(this.#frames) : this.#frames;
    const dropped = this.#frames.length - kept.length;
    if (kept.length >= MIN_FRAMES) return { progress: 1, done: { vectors: kept, dropped, gaveUp: false } };
    if (collecting >= o.maxMs) return { progress: 1, done: { vectors: kept, dropped, gaveUp: true } };
    return { progress: 1, done: null };
  }
}

// ---------- The model ----------

const LAMBDAS = [0.001, 0.01, 0.1, 1];
const KINDS = [0, 1]; // 0: linear; 1: plus squared eye terms

function design(z, kind) {
  const row = [1, ...z];
  if (kind === 1) row.push(z[0] * z[0], z[1] * z[1], z[0] * z[1], z[3] * z[3], z[4] * z[4], z[3] * z[4]);
  return row;
}
const standardize = (m, v) => v.map((x, j) => (x - m.mean[j]) / m.std[j]);

// Solves M·c = r by Gaussian elimination with partial pivoting; null if singular
function solve(M, r) {
  const n = r.length;
  const A = M.map((row, i) => [...row, r[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let i = col + 1; i < n; i++) if (Math.abs(A[i][col]) > Math.abs(A[pivot][col])) pivot = i;
    if (Math.abs(A[pivot][col]) < 1e-12) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let i = col + 1; i < n; i++) {
      const k = A[i][col] / A[col][col];
      if (k) for (let j = col; j <= n; j++) A[i][j] -= k * A[col][j];
    }
  }
  const c = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * c[j];
    c[i] = s / A[i][i];
  }
  return c;
}

// Weighted ridge on rows X (with the intercept first, not penalized) -> { cx, cy } or null
function ridge(rows, targets, weights, lambda) {
  const p = rows[0].length;
  const xtx = Array.from({ length: p }, () => new Array(p).fill(0));
  const xty = new Array(p).fill(0), xtyY = new Array(p).fill(0);
  let wsum = 0;
  rows.forEach((r, k) => {
    const w = weights[k];
    wsum += w;
    for (let i = 0; i < p; i++) {
      const wi = w * r[i];
      xty[i] += wi * targets[k].x;
      xtyY[i] += wi * targets[k].y;
      for (let j = i; j < p; j++) xtx[i][j] += wi * r[j];
    }
  });
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) xtx[i][j] = xtx[j][i];
  for (let i = 1; i < p; i++) xtx[i][i] += lambda * wsum;
  const cx = solve(xtx, xty), cy = solve(xtx, xtyY);
  return cx && cy && [...cx, ...cy].every(Number.isFinite) ? { cx, cy } : null;
}

function normalizer(samples) {
  const n = samples.length;
  const mean = Array.from({ length: FEATURE_COUNT }, (_, j) => samples.reduce((s, x) => s + x.v[j], 0) / n);
  const std = mean.map((m, j) => {
    const sd = Math.sqrt(samples.reduce((s, x) => s + (x.v[j] - m) ** 2, 0) / n);
    return sd > 1e-6 ? sd : 1;
  });
  return { mean, std };
}

const groupOf = (s) => s.group ?? `${s.target.x},${s.target.y}`;

function fitWith(samples, norm, kind, lambda) {
  const rows = samples.map((s) => design(standardize(norm, s.v), kind));
  const c = ridge(rows, samples.map((s) => s.target), samples.map((s) => s.w ?? 1), lambda);
  return c ? { v: 2, kind, mean: norm.mean, std: norm.std, cx: c.cx, cy: c.cy, ox: 0, oy: 0, ax: [1, 0, 0], ay: [0, 1, 0] } : null;
}

// Mean distance (window units) between each held-out point and where its frames land on average
function cvError(samples, norm, kind, lambda) {
  const groups = [...new Set(samples.map(groupOf))];
  let total = 0, count = 0;
  for (const g of groups) {
    const out = samples.filter((s) => groupOf(s) === g);
    const model = fitWith(samples.filter((s) => groupOf(s) !== g), norm, kind, lambda);
    if (!model) return Infinity;
    const ps = out.map((s) => rawPredict(model, s.v));
    const p = { x: ps.reduce((a, q) => a + q.x, 0) / ps.length, y: ps.reduce((a, q) => a + q.y, 0) / ps.length };
    total += dist(p, out[0].target);
    count++;
  }
  return total / count;
}

// samples: [{ v, target, group?, w? }] -> { model, cv: { kind, lambda, error }, candidates } or null.
// With fewer than 4 points it cannot leave one out: linear, mild regularization. With a single kind and
// lambda there is nothing to choose, so nothing is left out either (faster).
export function fitGazeModel(samples, { kinds = KINDS, lambdas = LAMBDAS } = {}) {
  const valid = samples.filter((s) => s.v?.length === FEATURE_COUNT && s.target);
  if (valid.length < FEATURE_COUNT + 2) return null;
  const norm = normalizer(valid);
  const groups = new Set(valid.map(groupOf)).size;
  const single = kinds.length === 1 && lambdas.length === 1;
  const candidates = [];
  if (groups >= 4 && !single) {
    for (const kind of kinds) for (const lambda of lambdas) candidates.push({ kind, lambda, error: cvError(valid, norm, kind, lambda) });
  } else {
    candidates.push(single ? { kind: kinds[0], lambda: lambdas[0], error: NaN } : { kind: 0, lambda: 0.01, error: NaN });
  }
  const best = candidates.reduce((a, c) => (c.error < a.error || Number.isNaN(a.error) ? c : a));
  const model = fitWith(valid, norm, best.kind, best.lambda);
  return model ? { model, cv: best, candidates } : null;
}

// Before the affine correction and without clamping
function rawPredict(model, v) {
  const d = design(standardize(model, v), model.kind);
  return { x: dot(model.cx, d) + (model.ox ?? 0), y: dot(model.cy, d) + (model.oy ?? 0) };
}

const applyAffine = (model, p) => (model.ax && model.ay
  ? { x: model.ax[0] * p.x + model.ax[1] * p.y + model.ax[2], y: model.ay[0] * p.x + model.ay[1] * p.y + model.ay[2] }
  : p);

// The window point (0..1) the person looks at, or null
export function predict(model, v) {
  const p = predictUnclamped(model, v);
  return p && { x: clamp01(p.x), y: clamp01(p.y) };
}

// The same, beyond the window's edges too (to measure how far off it is: models/gazeReport.js)
export function predictUnclamped(model, v) {
  if (!model || !v) return null;
  return applyAffine(model, rawPredict(model, v));
}

// "Corregir" (B8): the person looks at `target`; the whole fit shifts so that vector lands there
export function correctModel(model, v, target = CENTER) {
  if (!model || !v) return model;
  const p = rawPredict(model, v);
  let want = target;
  if (model.ax && model.ay) {
    // Undo the affine part, so the shift happens before it
    const [a, b, c] = model.ax, [d, e, f] = model.ay;
    const det = a * e - b * d;
    if (Math.abs(det) > 1e-9) want = { x: (e * (target.x - c) - b * (target.y - f)) / det, y: (a * (target.y - f) - d * (target.x - c)) / det };
  }
  return { ...model, ox: (model.ox ?? 0) + want.x - p.x, oy: (model.oy ?? 0) + want.y - p.y };
}

// Implicit recalibration: pairs { predicted (before the affine part), target, weight } -> the affine
// correction that best maps one onto the other, pulled toward "no change" so a few pairs do not overreach
export function fitAffine(pairs, lambda = 0.2) {
  const rows = pairs.map((p) => [p.predicted.x, p.predicted.y, 1]);
  const solveRow = (axis, prior) => {
    const M = Array.from({ length: 3 }, (_, i) => Array.from({ length: 3 }, (_, j) => (i === j ? lambda : 0)));
    const r = prior.map((v) => lambda * v);
    rows.forEach((row, k) => {
      const w = pairs[k].weight ?? 1;
      for (let i = 0; i < 3; i++) {
        r[i] += w * row[i] * pairs[k].target[axis];
        for (let j = 0; j < 3; j++) M[i][j] += w * row[i] * row[j];
      }
    });
    return solve(M, r) ?? prior;
  };
  return { ax: solveRow('x', [1, 0, 0]), ay: solveRow('y', [0, 1, 0]) };
}

export const withAffine = (model, { ax, ay }) => ({ ...model, ax: [...ax], ay: [...ay] });

// What confirmed selections may teach (2026-10-25). Learning from every selection bent the whole screen
// toward one corner (all of them in the dock) or toward a wrong target, so:
//   · a selection far from where the gaze was (more than twice the calibration's error) teaches nothing;
//   · until the selections cover at least 2 columns and 2 rows of a 3 × 3 grid (and are 4 or more), only a
//     shift is learned, shrunk toward none, never a stretch.
export function implicitCorrection(pairs, { viewport, errorPx = null } = {}) {
  const none = { ax: [1, 0, 0], ay: [0, 1, 0] };
  const vp = viewport ?? { width: 1, height: 1 };
  const limit = Math.max(2 * (errorPx ?? 75), 150);
  const ok = pairs.filter((p) => Math.hypot((p.target.x - p.predicted.x) * vp.width, (p.target.y - p.predicted.y) * vp.height) <= limit);
  if (!ok.length) return none;
  const cell = (v) => Math.min(2, Math.max(0, Math.floor(v * 3)));
  const columns = new Set(ok.map((p) => cell(p.target.x))).size;
  const rows = new Set(ok.map((p) => cell(p.target.y))).size;
  if (ok.length >= 4 && columns >= 2 && rows >= 2) return fitAffine(ok);
  const w = ok.reduce((s, p) => s + (p.weight ?? 1), 0);
  const shift = (axis) => ok.reduce((s, p) => s + (p.weight ?? 1) * (p.target[axis] - p.predicted[axis]), 0) / (w + 2);
  return { ax: [1, 0, shift('x')], ay: [0, 1, shift('y')] };
}

// ---------- How good it is ----------

// The error against the window's width: good (≲ 2° at 60 cm on a laptop), fair, bad
export function quality(errorPx, viewport) {
  if (!Number.isFinite(errorPx)) return 'bad';
  const r = errorPx / viewport.width;
  return r <= 0.08 ? 'good' : r <= 0.14 ? 'fair' : 'bad';
}

const correlation = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};

// MediaPipe's own guess must agree with where the points were: if it says "left" where the point was on the
// right, the labels are mirrored (the camera, or the eyes went the other way)
function mirrored(samples) {
  const groups = new Map();
  for (const s of samples) {
    if (s.group === 'head') continue;
    const g = groups.get(s.target) ?? { target: s.target, xs: [], ys: [] };
    g.xs.push(s.v[3]);
    g.ys.push(s.v[4]);
    groups.set(s.target, g);
  }
  const list = [...groups.values()];
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const cx = correlation(list.map((g) => mean(g.xs)), list.map((g) => g.target.x));
  const cy = correlation(list.map((g) => mean(g.ys)), list.map((g) => g.target.y));
  return cx < -0.3 || cy > 0.3; // lookY is up-positive, the window's y goes down
}

// ---------- The session ----------

// The guided calibration. options: viewport (px, for the errors); pace (1 = normal, 2 = twice as slow);
// headStep (the moment at the center with the head moving); base + points: repeat some points on top of a
// previous calibration's samples. update(vector | null, now) -> { stage: 'points' | 'head' | 'test', index,
// total, point, progress, done }. done: { model, errorPx, quality, report, rejected: null | 'inverted' |
// 'fit', samples, diagnostics } (in memory only). diagnostics, for the precision report (B38): { items: per
// point { stage, target, vectors (kept), dropped, gaveUp, trace: [{ dt (ms since the point appeared), v }] },
// training, fit (even when rejected), rejected, settleMs, collectMs, pace, viewport, base }.
export class GazeCalibration {
  #viewport;
  #pace;
  #plan;
  #at = 0;
  #sampler;
  #base;
  #training = [];
  #tests = [];
  #done = null;
  #log = [];
  #trace = [];
  #itemStart = null;

  constructor({ viewport, pace = 1, headStep = true, base = [], points = null }) {
    this.#viewport = viewport;
    this.#pace = pace;
    this.#base = base;
    const train = (points ?? CALIBRATION_POINTS).map((target) => ({ stage: 'points', target }));
    const head = headStep && !points ? [{ stage: 'head', target: CENTER }] : [];
    this.#plan = [...train, ...head, ...TEST_POINTS.map((target) => ({ stage: 'test', target }))];
    this.#sampler = this.#samplerFor(this.#plan[0]);
  }

  #samplerFor(item) {
    const k = this.#pace;
    return item.stage === 'head'
      ? new FixationSampler({ settleMs: SETTLE_MS * k, collectMs: HEAD_MS * k, maxMs: HEAD_MS * k * 1.5, robust: false })
      : new FixationSampler({ settleMs: SETTLE_MS * k, collectMs: COLLECT_MS * k, maxMs: MAX_COLLECT_MS * k });
  }

  get #item() {
    return this.#plan[Math.min(this.#at, this.#plan.length - 1)];
  }

  get point() {
    return this.#item.target;
  }

  update(v, now) {
    if (!this.#done) {
      this.#itemStart ??= now;
      this.#trace.push({ dt: now - this.#itemStart, v });
      const r = this.#sampler.update(v, now);
      if (r.done) {
        const item = this.#item;
        this.#log.push({ stage: item.stage, target: item.target, vectors: r.done.vectors, dropped: r.done.dropped, gaveUp: r.done.gaveUp, trace: this.#trace });
        this.#trace = [];
        this.#itemStart = null;
        if (item.stage === 'test') this.#tests.push({ target: item.target, vectors: r.done.vectors });
        else this.#training.push(...r.done.vectors.map((vec) => ({ v: vec, target: item.target, group: item.stage === 'head' ? 'head' : undefined, w: 1 })));
        this.#at++;
        if (this.#at >= this.#plan.length) this.#finish();
        else this.#sampler = this.#samplerFor(this.#item);
        return this.#state(0);
      }
      return this.#state(r.progress);
    }
    return this.#state(1);
  }

  #state(progress) {
    const item = this.#item;
    const same = this.#plan.filter((p) => p.stage === item.stage);
    return { stage: item.stage, index: same.indexOf(item), total: same.length, point: item.target, progress, done: this.#done };
  }

  #finish() {
    const vp = this.#viewport;
    const training = [...this.#base, ...this.#training];
    const fit = fitGazeModel(training);
    const diagnostics = (rejected) => ({
      items: this.#log, training, fit, rejected, settleMs: SETTLE_MS * this.#pace, collectMs: COLLECT_MS * this.#pace,
      pace: this.#pace, viewport: vp, base: this.#base.length,
    });
    const fail = (rejected) => ({ model: null, errorPx: null, quality: 'bad', report: [], rejected, samples: training, diagnostics: diagnostics(rejected) });
    if (!fit) { this.#done = fail('fit'); return; }
    if (mirrored(training)) { this.#done = fail('inverted'); return; }
    const report = this.#tests.map(({ target, vectors }) => {
      const ps = vectors.map((v) => predict(fit.model, v));
      const p = ps.length ? { x: ps.reduce((s, q) => s + q.x, 0) / ps.length, y: ps.reduce((s, q) => s + q.y, 0) / ps.length } : CENTER;
      return { target, predicted: p, errorPx: Math.round(Math.hypot((p.x - target.x) * vp.width, (p.y - target.y) * vp.height)) };
    });
    const errorPx = Math.round(median(report.map((r) => r.errorPx)));
    const limit = Math.max(1.5 * errorPx, 0.08 * vp.width);
    for (const r of report) r.bad = r.errorPx > limit;
    // The test points also teach the final model (more data where it was measured)
    const all = [...training, ...this.#tests.flatMap(({ target, vectors }) => vectors.map((v) => ({ v, target, w: 1 })))];
    const final = fitGazeModel(all, { kinds: [fit.cv.kind], lambdas: [fit.cv.lambda] })?.model ?? fit.model;
    this.#done = { model: final, errorPx, quality: quality(errorPx, vp), report, rejected: null, samples: all, diagnostics: diagnostics(null) };
  }
}

// ---------- While pointing ----------

// The One Euro filter (Casiez, Roussel and Vogel, CHI 2012): its cutoff rises with the speed, so a still
// gaze is calmed a lot and a fast move goes through. A webcam's gaze trembles so much (~100 px per frame)
// that the tremor itself looks like speed, so the filter runs calm (low cutoff, low beta) and a saccade is
// caught apart: when the last 3 points are all farther than `jump` from the output, the output jumps to
// their median. Points in window units, time in ms.
export class OneEuro {
  #o;
  #prev = null;
  #d = { x: 0, y: 0 };
  #recent = [];

  constructor({ minCutoff = 0.3, beta = 0.3, dCutoff = 1, jump = 0.2 } = {}) {
    this.#o = { minCutoff, beta, dCutoff, jump };
  }

  configure({ minCutoff, beta } = {}) {
    if (Number.isFinite(minCutoff)) this.#o.minCutoff = minCutoff;
    if (Number.isFinite(beta)) this.#o.beta = beta;
  }

  update(p, t) {
    if (!p) return this.reset();
    this.#recent.push({ x: p.x, y: p.y });
    if (this.#recent.length > 3) this.#recent.shift();
    if (!this.#prev) {
      this.#prev = { x: p.x, y: p.y, t };
      return { x: p.x, y: p.y };
    }
    if (this.#recent.length === 3 && this.#recent.every((q) => dist(q, this.#prev) > this.#o.jump)) {
      const m = { x: median(this.#recent.map((q) => q.x)), y: median(this.#recent.map((q) => q.y)) };
      if (dist(m, this.#prev) > this.#o.jump) {
        this.#prev = { ...m, t };
        this.#d = { x: 0, y: 0 };
        return { ...m };
      }
    }
    const dt = Math.max(1e-3, (t - this.#prev.t) / 1000);
    const alpha = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const ad = alpha(this.#o.dCutoff);
    this.#d = { x: this.#d.x + ad * ((p.x - this.#prev.x) / dt - this.#d.x), y: this.#d.y + ad * ((p.y - this.#prev.y) / dt - this.#d.y) };
    const a = alpha(this.#o.minCutoff + this.#o.beta * Math.hypot(this.#d.x, this.#d.y));
    const out = { x: this.#prev.x + a * (p.x - this.#prev.x), y: this.#prev.y + a * (p.y - this.#prev.y) };
    this.#prev = { ...out, t };
    return out;
  }

  reset() {
    this.#prev = null;
    this.#d = { x: 0, y: 0 };
    this.#recent = [];
    return null;
  }
}

// While the eyes fixate (every point of the last windowMs within radius of their middle), the cursor is
// held exactly still; a point beyond the radius frees it at once
export class FixationHold {
  #o;
  #window = [];
  #lock = null;

  constructor({ windowMs = 150, radius = 0.02 } = {}) {
    this.#o = { windowMs, radius };
  }

  configure({ radius } = {}) {
    if (Number.isFinite(radius)) this.#o.radius = radius;
  }

  update(p, t) {
    if (!p) return this.reset();
    this.#window.push({ x: p.x, y: p.y, t });
    while (this.#window.length && this.#window[0].t < t - this.#o.windowMs) this.#window.shift();
    if (this.#lock) {
      if (dist(p, this.#lock) <= this.#o.radius) return { ...this.#lock };
      this.#lock = null;
      this.#window = [{ x: p.x, y: p.y, t }];
      return { x: p.x, y: p.y };
    }
    const span = t - this.#window[0].t;
    const c = { x: this.#window.reduce((s, q) => s + q.x, 0) / this.#window.length, y: this.#window.reduce((s, q) => s + q.y, 0) / this.#window.length };
    if (span >= this.#o.windowMs * 0.8 && this.#window.every((q) => dist(q, c) <= this.#o.radius)) {
      this.#lock = c;
      return { ...c };
    }
    return { x: p.x, y: p.y };
  }

  reset() {
    this.#window = [];
    this.#lock = null;
    return null;
  }
}

// ---------- Position, before calibrating ----------

// Below this mean luminance (0..1) the image is too dark for the irises (spec/004, B37)
export const DARK = 0.2;

// face, { light } -> { ok, issue: null | 'noFace' | 'light' | 'eyes' | 'closer' | 'farther' | 'center' | 'frontal' }
export function positionCheck(face, { light = null } = {}) {
  if (!face?.landmarks) return { ok: false, issue: 'noFace' };
  if (Number.isFinite(light) && light < DARK) return { ok: false, issue: 'light' };
  const b = face.blendshapes ?? {};
  if (Math.max(b.eyeBlinkLeft ?? 0, b.eyeBlinkRight ?? 0) >= POSITION_EYES) return { ok: false, issue: 'eyes' };
  const l = face.landmarks;
  const spacing = Math.abs((l[P.leftOuter]?.x ?? 0) - (l[P.rightOuter]?.x ?? 0));
  if (spacing < 0.09) return { ok: false, issue: 'closer' };
  if (spacing > 0.3) return { ok: false, issue: 'farther' };
  const nose = l[P.noseTip];
  if (!nose || nose.x < 0.3 || nose.x > 0.7 || nose.y < 0.2 || nose.y > 0.8) return { ok: false, issue: 'center' };
  const pose = headPose(face.matrix);
  if (pose && (Math.abs(pose.yaw) > 15 || Math.abs(pose.pitch) > 20)) return { ok: false, issue: 'frontal' };
  return { ok: true, issue: null };
}
