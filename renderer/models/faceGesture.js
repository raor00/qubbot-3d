// The math of the hands-free control (spec/004-hands-free-control.md), as pure functions over MediaPipe's
// face landmarks (image coordinates 0..1, x to the right of the image, y down) and the blink blendshapes. No
// DOM, no camera: the tests feed synthetic faces (tests/renderer/faceFixtures.mjs). The gaze lives in
// models/gazeModel.js.
//   · the head: the tip of the nose against its rest position, with a gain for each direction.
//   · the long blink, the magnifier's geometry and the pull toward the nearest target.
// Nothing here is kept beyond a frame except the numbers of a calibration (never points of the face).

// MediaPipe face mesh indices. "Right" and "left" are the person's (their right eye is on the image's left).
export const FACE_POINTS = {
  noseTip: 1,
  rightOuter: 33, rightInner: 133, rightUpper: 159, rightLower: 145, rightIris: 468,
  leftInner: 362, leftOuter: 263, leftUpper: 386, leftLower: 374, leftIris: 473,
};
const P = FACE_POINTS;
export const EYE_CLOSED = 0.5; // a blink blendshape above this: that eye is closed

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Taking a point while the gaze (or the head) stays still ----------

const SETTLE_MS = 500; // the head settles
const COLLECT_MS = 700; // then this long, still
const STILL = 0.02; // a value this close to the median is still (feature or image units)
const STILL_SHARE = 0.8; // and this share of the values must be
const GIVE_UP_MS = 4000; // a gaze that never settles is taken anyway, so a calibration never hangs

const median = (values) => {
  const xs = values.map((v) => v.x).sort((a, b) => a - b), ys = values.map((v) => v.y).sort((a, b) => a - b);
  const mid = (arr) => (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
  return { x: mid(xs), y: mid(ys) };
};

// Taking a still point (the head's rest for "Recentrar"). update(value | null, now) -> { progress 0..1,
// done: { x, y } | null }. A null value is skipped.
export class PointSampler {
  #start = null;
  #values = [];
  #opts;

  constructor({ still = STILL, settleMs = SETTLE_MS, collectMs = COLLECT_MS, giveUpMs = GIVE_UP_MS } = {}) {
    this.#opts = { still, settleMs, collectMs, giveUpMs };
  }

  update(value, now) {
    const o = this.#opts;
    this.#start ??= now;
    if (now - this.#start < o.settleMs) return { progress: 0, done: null };
    if (value) {
      this.#values.push({ x: value.x, y: value.y, t: now });
      while (this.#values.length && this.#values[0].t < now - o.collectMs) this.#values.shift();
    }
    if (!this.#values.length) return { progress: 0, done: null };
    const center = median(this.#values);
    const near = this.#values.filter((v) => dist(v, center) <= o.still).length;
    const still = near >= this.#values.length * STILL_SHARE;
    if (!still && value) this.#values = this.#values.slice(-1); // it moved: start counting again from here
    const span = this.#values.at(-1).t - this.#values[0].t;
    const progress = Math.min(1, span / o.collectMs);
    if (still && span >= o.collectMs * 0.95) return { progress: 1, done: center };
    if (now - this.#start - o.settleMs >= o.giveUpMs) return { progress: 1, done: median(this.#values) };
    return { progress, done: null };
  }
}

// ---------- Smoothing ----------

// smoothing 0..0.9: the share of the previous position kept each frame; a dead zone stops a resting tremor
export class PointSmoother {
  #at = null;
  #sent = null;
  #smoothing;
  #deadZone;

  constructor({ smoothing = 0.5, deadZone = 0.003 } = {}) {
    this.#smoothing = smoothing;
    this.#deadZone = deadZone;
  }

  configure({ smoothing }) {
    if (Number.isFinite(smoothing)) this.#smoothing = smoothing;
  }

  update(p) {
    if (!p) return this.reset();
    if (!this.#at) {
      this.#at = { ...p };
      this.#sent = { ...p };
      return { ...p };
    }
    const k = 1 - this.#smoothing;
    this.#at = { x: this.#at.x + (p.x - this.#at.x) * k, y: this.#at.y + (p.y - this.#at.y) * k };
    if (dist(this.#at, this.#sent) > this.#deadZone) this.#sent = { ...this.#at };
    return { ...this.#sent };
  }

  reset() {
    this.#at = null;
    this.#sent = null;
    return null;
  }
}

// ---------- Head ----------

export const DEFAULT_GAINS = { left: 4, right: 4, up: 4, down: 4 };
const noseOf = (face) => face?.landmarks?.[P.noseTip] ?? null;

// The cursor follows the nose against its rest position (the first frame, or "Recentrar"). The person's
// right is the image's left. gains: how far the cursor goes per unit of head movement, for each direction.
export class HeadPointer {
  #rest = null;
  #gains;
  #smoother;

  constructor({ gains = DEFAULT_GAINS, smoothing = 0.5 } = {}) {
    this.#gains = { ...DEFAULT_GAINS, ...gains };
    this.#smoother = new PointSmoother({ smoothing });
  }

  configure({ gains, smoothing } = {}) {
    if (gains) this.#gains = { ...this.#gains, ...gains };
    this.#smoother.configure({ smoothing });
  }

  recenter(faceOrNose) {
    const n = faceOrNose?.landmarks ? noseOf(faceOrNose) : faceOrNose;
    if (n) this.#rest = { x: n.x, y: n.y };
    this.#smoother.reset();
  }

  update(face) {
    const n = noseOf(face);
    if (!n) return null;
    this.#rest ??= { x: n.x, y: n.y };
    const dx = -(n.x - this.#rest.x);
    const dy = n.y - this.#rest.y;
    const g = this.#gains;
    const x = 0.5 + dx * (dx >= 0 ? g.right : g.left);
    const y = 0.5 + dy * (dy >= 0 ? g.down : g.up);
    return this.#smoother.update({ x: clamp01(x), y: clamp01(y) });
  }

  reset() {
    this.#rest = null;
    this.#smoother.reset();
  }
}

export const nosePoint = (face) => {
  const n = noseOf(face);
  return n ? { x: n.x, y: n.y } : null;
};

// ---------- Long blink ----------

const BLINK_ON = EYE_CLOSED;
const BLINK_OFF = 0.35;
// Spontaneous blinks last ~100-400 ms depending on the source: a long blink is never shorter than this
export const LONG_BLINK_MIN_MS = 500;

// One eye closed is enough (a palsy may keep the other one open). update(face, now) ->
// { closed, duration, long: fires once per closing past the threshold, ended: ms of a closing that ended }
export class BlinkTracker {
  #closed = false;
  #since = 0;
  #fired = false;
  #threshold;

  constructor({ thresholdMs = null } = {}) {
    this.#threshold = thresholdMs;
  }

  setThreshold(ms) {
    this.#threshold = ms;
  }

  update(face, now) {
    const b = face?.blendshapes ?? {};
    const score = Math.max(b.eyeBlinkLeft ?? 0, b.eyeBlinkRight ?? 0);
    const closed = this.#closed ? score > BLINK_OFF : score >= BLINK_ON;
    let ended = null, long = false;
    if (closed && !this.#closed) { this.#since = now; this.#fired = false; }
    if (!closed && this.#closed) ended = now - this.#since;
    this.#closed = closed;
    const duration = closed ? now - this.#since : 0;
    if (closed && this.#threshold && !this.#fired && duration >= this.#threshold) {
      long = true;
      this.#fired = true;
    }
    return { closed, duration, long, ended };
  }

  reset() {
    this.#closed = false;
    this.#fired = false;
  }
}

// From the person's long blinks: above their spontaneous ones, a bit shorter than what they did
export function longBlinkThreshold(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return Math.max(LONG_BLINK_MIN_MS, Math.round(mid * 0.6));
}

// ---------- Magnifier ----------

const LENS_MIN = 360;
// The magnifier's side in px: three times the measured error (the gaze must fit inside), within the window
export function lensSize(errorPx, viewport) {
  const wanted = Math.max(LENS_MIN, errorPx ? 3 * errorPx : 0);
  return Math.round(Math.min(wanted, 0.8 * Math.min(viewport.width, viewport.height)));
}

// The box (centered on the gaze, kept inside the window) and the scale origin that makes the gazed point
// appear at the box's center: a point p of the window is drawn at origin + factor·(p − origin).
// source: the part of the window the box shows. All in px.
export function lensGeometry(gaze, { factor, size }, viewport) {
  const half = size / 2;
  const c = { x: clamp(gaze.x, half, viewport.width - half), y: clamp(gaze.y, half, viewport.height - half) };
  const origin = factor === 1 ? { ...gaze } : { x: (factor * gaze.x - c.x) / (factor - 1), y: (factor * gaze.y - c.y) / (factor - 1) };
  const s = { x: origin.x + (c.x - origin.x) / factor, y: origin.y + (c.y - origin.y) / factor };
  return {
    box: { x: c.x - half, y: c.y - half, w: size, h: size },
    origin,
    source: { x: s.x - half / factor, y: s.y - half / factor, w: size / factor, h: size / factor },
    factor,
  };
}

export const inside = (box, p) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

// ---------- Pull toward the nearest target ----------

const distToRect = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

// candidates: [{ rect: { x, y, w, h } | point: { x, y }, … }] in px -> the nearest within radius, or null
export function nearestTarget(point, candidates, radius) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = c.rect ? distToRect(point, c.rect) : c.point ? dist(point, c.point) : Infinity;
    if (d <= radius && d < bestD) { best = c; bestD = d; }
  }
  return best;
}
