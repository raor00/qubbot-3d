// The precision report (spec/004-hands-free-control.md, B38): to measure the gaze with a real camera. Only in
// `npm run dev`, ⌘⇧D copies it as text. From what the last calibration kept in memory it says, in numbers:
//   · per point: frames kept, dropped and lost, how fast the camera ran, how much each feature trembles, the
//     gaze's spread and drift in px, and how far from its target it landed;
//   · per feature: how much it moves between the points against how much it trembles, and its sign;
//   · the model: which kind and lambda won, the error leaving one point out (per axis), the same with only
//     some features, and the weight of each feature;
//   · when the eyes got to the points (is the wait long enough?);
//   · the test points' error in px and degrees, and what the filter does with the real tremor.
// No frames, face points or blendshapes ever reach the text; nothing here is stored, logged or sent.
import { FEATURES, fitGazeModel, predict, predictUnclamped, OneEuro, FixationHold } from './gazeModel.js';

export const SCREEN_INCHES = 13.3; // the assumed screen (a 13" laptop), to turn px into degrees
export const EYE_CM = 60;
const BIN_MS = 150; // the arrival is told in steps of this long
const WARM_MS = 300; // the filter's first moment on a test point is not counted
// Groups of features compared leaving one point out (indexes in FEATURES)
export const SUBSETS = {
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  eyes: [0, 1, 2], // the irises and the lids
  look: [3, 4], // MediaPipe's own guess
  eyesLook: [0, 1, 2, 3, 4],
  eyesHead: [0, 1, 2, 5, 6, 7, 8, 9],
  lookHead: [3, 4, 5, 6, 7, 8, 9],
};
const SQUARES = ['irisX²', 'irisY²', 'irisX·irisY', 'lookX²', 'lookY²', 'lookX·lookY'];

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
const sd = (xs) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
};
const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const correlation = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};
const meanPoint = (ps) => ({ x: mean(ps.map((p) => p.x)), y: mean(ps.map((p) => p.y)) });
const groupOf = (s) => s.group ?? `${s.target.x},${s.target.y}`;

// CSS px -> degrees of visual angle, for a screen of `inches` diagonal seen from `eyeCm`
export function screenScale({ screen, inches = SCREEN_INCHES, eyeCm = EYE_CM }) {
  const cmPerPx = (inches * 2.54) / Math.hypot(screen.width, screen.height);
  return {
    inches, eyeCm, screen, cmPerPx,
    widthCm: screen.width * cmPerPx,
    pxPerDeg: (Math.tan(rad(1)) * eyeCm) / cmPerPx,
    toDeg: (px) => deg(Math.atan((px * cmPerPx) / eyeCm)),
  };
}

// diagnostics: GazeCalibration's done.diagnostics. env: { screen: { width, height } (CSS px), inches, eyeCm,
// filter: OneEuro options, holdRadius, live: { fps, delegate, cameraSize, light }, settings, implicit }
export function analyzeCalibration(diag, env = {}) {
  if (!diag) return null;
  const vp = diag.viewport;
  const scale = screenScale({ screen: env.screen?.width ? env.screen : vp, inches: env.inches, eyeCm: env.eyeCm });
  const model = diag.fit?.model ?? null;
  const at = (v) => { const p = predictUnclamped(model, v); return { x: p.x * vp.width, y: p.y * vp.height }; };
  const items = diag.items.map((item) => describeItem(item, { model, at, vp, settleMs: diag.settleMs }));
  const points = items.filter((i) => i.stage === 'points' && i.kept);
  const headStep = items.find((i) => i.stage === 'head');
  const features = FEATURES.map((name, j) => {
    const means = points.map((p) => p.means[j]);
    const range = means.length ? Math.max(...means) - Math.min(...means) : NaN;
    const within = mean(points.map((p) => p.featureSd[j]).filter(Number.isFinite));
    return {
      name, range, within,
      snr: within > 1e-12 ? range / within : range > 0 ? Infinity : 0,
      corrX: correlation(means, points.map((p) => p.target.x)),
      corrY: correlation(means, points.map((p) => p.target.y)),
      headSd: headStep?.featureSd[j] ?? NaN,
    };
  });
  const tests = model ? describeTests(items, diag, env, vp, scale) : [];
  const medianPx = median(tests.map((t) => t.errorPx));
  return {
    rejected: diag.rejected, viewport: vp, scale, settleMs: diag.settleMs, collectMs: diag.collectMs, pace: diag.pace,
    base: diag.base, items, features, tests,
    fit: model ? describeFit(diag, vp) : null,
    subsets: model ? compareSubsets(diag, vp) : [],
    arrival: arrival(items),
    summary: {
      medianPx, medianDeg: scale.toDeg(medianPx),
      dx: median(tests.map((t) => Math.abs(t.dx))), dy: median(tests.map((t) => Math.abs(t.dy))),
    },
    fps: median(items.map((i) => i.fps).filter(Number.isFinite)),
    env,
  };
}

function describeItem(item, { model, at, vp, settleMs }) {
  const { stage, target, vectors, dropped, gaveUp, trace } = item;
  const gaps = trace.slice(1).map((f, i) => f.dt - trace[i].dt).filter((g) => g > 0);
  const out = {
    stage, target, kept: vectors.length, dropped, gaveUp,
    lost: trace.filter((f) => f.dt >= settleMs && !f.v).length, // no face or both eyes closed
    ms: trace.length ? trace[trace.length - 1].dt : 0,
    fps: gaps.length ? 1000 / median(gaps) : NaN,
    means: FEATURES.map((_, j) => mean(vectors.map((v) => v[j]))),
    featureSd: FEATURES.map((_, j) => sd(vectors.map((v) => v[j]))),
    spread: null, drift: NaN, offset: null, arrival: [],
  };
  if (!model || !vectors.length) return out;
  const ps = vectors.map(at);
  const center = meanPoint(ps);
  // The first third against the last: a drift means the eyes were still arriving (or leaving)
  const third = Math.max(1, Math.floor(ps.length / 3));
  const first = meanPoint(ps.slice(0, third)), last = meanPoint(ps.slice(-third));
  out.spread = { x: sd(ps.map((p) => p.x)), y: sd(ps.map((p) => p.y)) };
  out.drift = Math.hypot(last.x - first.x, last.y - first.y);
  out.offset = { x: center.x - target.x * vp.width, y: center.y - target.y * vp.height };
  // How far from where they settled the eyes were, from the moment the point appeared (the mean of each step,
  // so the frame-to-frame tremor does not hide the arrival)
  const bins = [];
  for (const f of trace) if (f.v) (bins[Math.floor(f.dt / BIN_MS)] ??= []).push(at(f.v));
  out.arrival = Array.from(bins, (b) => {
    if (!b?.length) return NaN;
    const m = meanPoint(b);
    return Math.hypot(m.x - center.x, m.y - center.y);
  });
  return out;
}

// Leaving each point out: fit with the rest, see where its frames land (px, per axis). The head step is told
// apart (it says whether the head is understood without having seen it).
function leaveOneOut(samples, { kind, lambda, vp, keep = null }) {
  const masked = keep ? samples.map((s) => ({ ...s, v: s.v.map((x, j) => (keep.includes(j) ? x : 0)) })) : samples;
  const groups = [...new Set(masked.map(groupOf))];
  if (groups.length < 4) return null;
  const errors = [];
  let head = NaN;
  for (const g of groups) {
    const out = masked.filter((s) => groupOf(s) === g);
    const fit = fitGazeModel(masked.filter((s) => groupOf(s) !== g), { kinds: [kind], lambdas: [lambda] });
    if (!fit) return null;
    const p = meanPoint(out.map((s) => predictUnclamped(fit.model, s.v)));
    const e = { dx: (p.x - out[0].target.x) * vp.width, dy: (p.y - out[0].target.y) * vp.height };
    if (g === 'head') head = Math.hypot(e.dx, e.dy);
    else errors.push(e);
  }
  return {
    median: median(errors.map((e) => Math.hypot(e.dx, e.dy))),
    x: median(errors.map((e) => Math.abs(e.dx))),
    y: median(errors.map((e) => Math.abs(e.dy))),
    head,
  };
}

function describeFit(diag, vp) {
  const { kind, lambda } = diag.fit.cv;
  const candidates = diag.fit.candidates.map((c) => ({ kind: c.kind, lambda: c.lambda, ...(leaveOneOut(diag.training, { kind: c.kind, lambda: c.lambda, vp }) ?? { median: NaN }) }));
  const loo = candidates.find((c) => c.kind === kind && c.lambda === lambda) ?? leaveOneOut(diag.training, { kind, lambda, vp }) ?? { median: NaN, x: NaN, y: NaN, head: NaN };
  const m = diag.fit.model;
  // In px per standard deviation of each feature (over the calibration), so they compare
  const coefficients = FEATURES.map((name, j) => ({ name, x: m.cx[j + 1] * vp.width, y: m.cy[j + 1] * vp.height }));
  const squares = m.kind === 1 ? SQUARES.map((name, k) => ({ name, x: m.cx[11 + k] * vp.width, y: m.cy[11 + k] * vp.height })) : [];
  return { kind, lambda, loo, candidates, coefficients, squares };
}

function compareSubsets(diag, vp) {
  return Object.entries(SUBSETS).map(([name, keep]) => {
    let best = null;
    for (const c of diag.fit.candidates) {
      const r = leaveOneOut(diag.training, { kind: c.kind, lambda: c.lambda, vp, keep });
      if (r && Number.isFinite(r.median) && (!best || r.median < best.median)) best = { ...r, kind: c.kind, lambda: c.lambda };
    }
    return { name, ...(best ?? { median: NaN, x: NaN, y: NaN, head: NaN }) };
  });
}

// Over the points and the tests (not the head step): the median and the worst, per step of BIN_MS
function arrival(items) {
  const relevant = items.filter((i) => i.stage !== 'head' && i.arrival.length);
  const bins = Math.max(0, ...relevant.map((i) => i.arrival.length));
  return Array.from({ length: bins }, (_, b) => {
    const values = relevant.map((i) => i.arrival[b]).filter(Number.isFinite);
    return { from: b * BIN_MS, to: (b + 1) * BIN_MS, median: median(values), max: values.length ? Math.max(...values) : NaN, n: values.length };
  });
}

// The test points (never trained on): the error, and the real tremor through the same filter and hold as
// while pointing
function describeTests(items, diag, env, vp, scale) {
  return items.flatMap((t, k) => (t.stage === 'test' && t.offset ? [{ t, trace: diag.items[k].trace }] : [])).map(({ t, trace }) => {
    const errorPx = Math.hypot(t.offset.x, t.offset.y);
    const frames = trace.filter((f) => f.dt >= diag.settleMs && f.v);
    const euro = new OneEuro(env.filter ?? {});
    const hold = new FixationHold({ radius: env.holdRadius ?? 0.02 });
    const raws = [], outs = [];
    let held = 0, prev = null;
    for (const f of frames) {
      const p = predict(diag.fit.model, f.v);
      const o = hold.update(euro.update(p, f.dt), f.dt);
      if (f.dt - frames[0].dt >= WARM_MS) {
        raws.push(p);
        outs.push(o);
        if (prev && o.x === prev.x && o.y === prev.y) held++;
      }
      prev = o;
    }
    const spread = (ps) => Math.hypot(sd(ps.map((p) => p.x)) * vp.width, sd(ps.map((p) => p.y)) * vp.height);
    return {
      target: t.target, errorPx, errorDeg: scale.toDeg(errorPx), dx: t.offset.x, dy: t.offset.y,
      rawSd: spread(raws), filteredSd: spread(outs), held: outs.length ? held / outs.length : 0,
    };
  });
}

// ---------- The text ----------

const num = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const sig = (v) => (!Number.isFinite(v) ? '-' : Math.abs(v) >= 100 ? v.toFixed(0) : String(Number(v.toPrecision(2))));
const signed = (v) => (!Number.isFinite(v) ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}`);
const pt = (t) => `(${num(t.x, 2)},${num(t.y, 2)})`;

export function formatReport(a) {
  if (!a) return null;
  const { scale, env } = a;
  const live = env.live ?? {}, s = env.settings ?? {};
  const deg1 = (px) => `${num(scale.toDeg(px), 1)}°`;
  const L = [];
  L.push('platanus gaze report v1');
  L.push(`env: window ${a.viewport.width}x${a.viewport.height} | screen ${scale.screen.width}x${scale.screen.height} px, assumed ${scale.inches}" (${num(scale.widthCm, 1)} cm wide), eye ${scale.eyeCm} cm: 1° = ${num(scale.pxPerDeg)} px`
    + ` | camera ${live.cameraSize ? `${live.cameraSize.width}x${live.cameraSize.height}` : '-'} | fps now ${num(live.fps)} ${live.delegate ?? '-'}, calibration ${num(a.fps)} | light ${num(live.light, 2)}`);
  L.push(`settings: pointer ${s.pointer ?? '-'} | pace ${num(s.pace, 1)} | smoothing ${num(s.smoothing, 1)} -> minCutoff ${num(env.filter?.minCutoff, 2)} | hold radius ${num(env.holdRadius, 3)} | dwell ${num(s.dwellMs)} ms | tolerance ${num(s.tolerance, 3)} | lens x${num(s.lensFactor, 1)}`);
  const count = (stage) => a.items.filter((i) => i.stage === stage).length;
  L.push(`calibration: rejected ${a.rejected ?? 'none'} | ${count('points')} points + ${count('head') ? 'head step' : 'no head step'} + ${count('test')} tests | base samples ${a.base} | settle ${num(a.settleMs)} ms, collect ${num(a.collectMs)} ms`);
  L.push(`result: test median ${num(a.summary.medianPx)} px = ${deg1(a.summary.medianPx)} | median |dx| ${num(a.summary.dx)} px, |dy| ${num(a.summary.dy)} px`);

  if (a.fit) {
    const f = a.fit;
    L.push('');
    L.push(`fit: kind ${f.kind} (${f.kind ? 'with squares' : 'linear'}), lambda ${f.lambda} | leave one point out: median ${num(f.loo.median)} px = ${deg1(f.loo.median)}, |dx| ${num(f.loo.x)}, |dy| ${num(f.loo.y)} px | head step left out ${num(f.loo.head)} px`);
    L.push(`candidates (kind/lambda: median px): ${f.candidates.map((c) => `${c.kind}/${c.lambda} ${num(c.median)}`).join(' | ')}`);
    L.push(`by features (best leave-one-out median px (|dx|, |dy|)): ${a.subsets.map((x) => `${x.name} ${num(x.median)} (${num(x.x)}, ${num(x.y)})`).join(' | ')}`);
    L.push(`coef px per sd (x|y): ${f.coefficients.map((c) => `${c.name} ${signed(c.x)}|${signed(c.y)}`).join('  ')}`);
    if (f.squares.length) L.push(`squares px per sd² (x|y): ${f.squares.map((c) => `${c.name} ${signed(c.x)}|${signed(c.y)}`).join('  ')}`);
  }

  L.push('');
  L.push('features: range between points, mean sd within a point, snr = range / sd, correlation with target x and y, sd in the head step');
  for (const f of a.features) {
    L.push(`  ${f.name.padEnd(6)} range ${sig(f.range)}  sd ${sig(f.within)}  snr ${sig(f.snr)}  corr x ${num(f.corrX, 2)} y ${num(f.corrY, 2)}  head sd ${sig(f.headSd)}`);
  }

  L.push('');
  L.push(`points: # stage target: kept/dropped, lost, gave up, ms, fps | gaze sd x/y px | drift px (first third -> last) | offset dx/dy px | feature sd: ${a.features.map((f) => f.name).join(' ')}`);
  a.items.forEach((i, k) => {
    L.push(`  ${k + 1} ${i.stage} ${pt(i.target)}: ${i.kept}/${i.dropped}, lost ${i.lost}, ${i.gaveUp ? 'gave up' : 'ok'}, ${num(i.ms)} ms, ${num(i.fps)} fps`
      + ` | sd ${num(i.spread?.x)}/${num(i.spread?.y)} | drift ${num(i.drift)} | off ${signed(i.offset?.x)}/${signed(i.offset?.y)} | ${i.featureSd.map(sig).join(' ')}`);
  });

  const enough = Math.ceil(a.items.filter((i) => i.stage !== 'head').length / 2);
  const bins = a.arrival.filter((b) => b.n >= enough);
  if (bins.length) {
    L.push('');
    L.push('arrival: px from where the gaze settled (mean of each step), median/max over the points, by ms since the point appeared');
    L.push(`  ${bins.map((b) => `${b.from}-${b.to} ${num(b.median)}/${num(b.max)}`).join(' | ')}`);
  }

  if (a.tests.length) {
    L.push('');
    L.push('tests: # target: error px, degrees | dx dy px | tremor raw -> filtered px | held still');
    a.tests.forEach((t, k) => {
      L.push(`  ${k + 1} ${pt(t.target)}: ${num(t.errorPx)} px, ${num(t.errorDeg, 1)}° | ${signed(t.dx)} ${signed(t.dy)} | ${num(t.rawSd)} -> ${num(t.filteredSd)} | ${num(t.held * 100)}%`);
    });
  }

  const imp = env.implicit;
  if (imp) {
    L.push('');
    L.push(`use: selections learned ${imp.count}, median distance ${num(imp.medianPx)} px | correction x [${(imp.ax ?? []).map((v) => num(v, 3)).join(', ')}] y [${(imp.ay ?? []).map((v) => num(v, 3)).join(', ')}]`);
  }
  return L.join('\n');
}
