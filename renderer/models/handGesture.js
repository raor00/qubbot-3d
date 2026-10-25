// Hand gestures from the camera, as plain numbers (no DOM, no camera). The hand comes as MediaPipe's
// 21 landmarks in image coordinates (0..1, x to the right of the image, y down).
// Pinch (thumb and index tips together) grabs the map. While pinching, the hand either drags it (the palm
// moves) or turns it (the hand turns like a knob, the palm stays): the first one past its threshold wins
// until the hand lets go, so a drag never turns the map by accident and a turn never drags it. Opening the
// hand or losing it lets go. Thresholds are relative to the hand's size, so distance to the camera does not matter.
const WRIST = 0, THUMB_TIP = 4, INDEX_KNUCKLE = 5, INDEX_TIP = 8, MIDDLE_KNUCKLE = 9, PINKY_KNUCKLE = 17;

const PINCH_ON = 0.3;    // tips closer than this (× hand size) grab
const PINCH_OFF = 0.45;  // and farther than this let go (in between, it keeps its state)
const SMOOTHING = 0.5;   // share of the new position in each frame (the rest is the previous one)
const DEAD_ZONE = 0.004; // movement smaller than this (image units) is tremor, not a drag
const ANGLE_DEAD_ZONE = 0.01; // radians
const PAN_LOCK = 0.15;   // the palm moved this much (× hand size): it is a drag
const ROTATE_LOCK = 0.2; // the hand turned this much (radians, ~11°) first: it is a turn

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const still = (pinching, mode = null) => ({ pinching, mode, dx: 0, dy: 0, dAngle: 0 });
// Shortest signed difference between two angles
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function palmOf(l) {
  return {
    x: (l[WRIST].x + l[INDEX_KNUCKLE].x + l[PINKY_KNUCKLE].x) / 3,
    y: (l[WRIST].y + l[INDEX_KNUCKLE].y + l[PINKY_KNUCKLE].y) / 3,
  };
}

// Direction of the hand (wrist to middle knuckle) as the person sees it: mirrored, so a growing angle is a
// clockwise turn for them
const angleOf = (l) => Math.atan2(l[MIDDLE_KNUCKLE].y - l[WRIST].y, -(l[MIDDLE_KNUCKLE].x - l[WRIST].x));

export class PinchTracker {
  #grab = null; // while pinching: { mode, at, sent, angle, sentAngle, palm0, angle0 }
  #rotate;

  // rotate: false = a pinch only drags (turning is the two-hand gesture, spec/003-hand-gestures.md)
  constructor({ rotate = true } = {}) {
    this.#rotate = rotate;
  }

  // Already dragging or turning (the gesture is decided until the hand lets go)
  get busy() {
    return Boolean(this.#grab?.mode);
  }

  // landmarks: the hand's 21 points, or null when no hand is in view. Returns { pinching, mode, dx, dy,
  // dAngle }: mode is null (not decided yet), 'pan' or 'rotate'; dx, dy is the drag since the last frame
  // as the person sees it (mirrored in x); dAngle the turn since the last frame (clockwise > 0).
  update(landmarks) {
    if (!landmarks) return this.#release();
    const size = dist(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]) || 1;
    const gap = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / size;
    if (!this.#grab && gap >= PINCH_ON) return still(false);
    if (this.#grab && gap > PINCH_OFF) return this.#release();

    const point = {
      x: (landmarks[THUMB_TIP].x + landmarks[INDEX_TIP].x) / 2,
      y: (landmarks[THUMB_TIP].y + landmarks[INDEX_TIP].y) / 2,
    };
    const angle = angleOf(landmarks);
    const palm = palmOf(landmarks);
    if (!this.#grab) {
      this.#grab = { mode: null, at: point, sent: point, angle, sentAngle: angle, palm0: palm, angle0: angle };
      return still(true);
    }

    const g = this.#grab;
    g.at = { x: g.at.x + (point.x - g.at.x) * SMOOTHING, y: g.at.y + (point.y - g.at.y) * SMOOTHING };
    g.angle += angleDiff(angle, g.angle) * SMOOTHING;
    if (!g.mode) {
      if (this.#rotate && Math.abs(angleDiff(g.angle, g.angle0)) > ROTATE_LOCK) g.mode = 'rotate';
      else if (dist(palm, g.palm0) / size > PAN_LOCK) g.mode = 'pan';
      else return still(true);
    }

    if (g.mode === 'rotate') {
      const dAngle = angleDiff(g.angle, g.sentAngle);
      if (Math.abs(dAngle) < ANGLE_DEAD_ZONE) return still(true, 'rotate');
      g.sentAngle = g.angle;
      return { ...still(true, 'rotate'), dAngle };
    }
    const dx = g.at.x - g.sent.x, dy = g.at.y - g.sent.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return still(true, 'pan');
    g.sent = g.at;
    return { ...still(true, 'pan'), dx: -dx, dy };
  }

  #release() {
    this.#grab = null;
    return still(false);
  }
}

// ---- Hold and move with two hands, the cursor and selecting by holding still (spec/003-hand-gestures.md) ----

const handSize = (l) => dist(l[WRIST], l[MIDDLE_KNUCKLE]) || 1;
const pinchPoint = (l) => ({ x: (l[THUMB_TIP].x + l[INDEX_TIP].x) / 2, y: (l[THUMB_TIP].y + l[INDEX_TIP].y) / 2 });

// Pinched or not, with the same hysteresis as the grab: `was` is the previous state of that hand
export function isPinched(landmarks, was) {
  const gap = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / handSize(landmarks);
  return was ? gap <= PINCH_OFF : gap < PINCH_ON;
}

// The middle of the camera image covers the whole window, so the cursor reaches the edges without the
// hand leaving the camera (hands near the image border are tracked badly). Mirrored: the person's right.
export const POINTER_BOX = { x0: 0.15, x1: 0.85, y0: 0.15, y1: 0.85 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Image point -> window point (0..1, as the person sees it)
export function toViewport(p) {
  const b = POINTER_BOX;
  return { x: clamp01((1 - p.x - b.x0) / (b.x1 - b.x0)), y: clamp01((p.y - b.y0) / (b.y1 - b.y0)) };
}

// Hold and move (spec/003-hand-gestures.md): both hands pinch; one holds still and the other moves. Up or
// down zooms (up = closer), sideways turns (to the person's right = clockwise). The hand that moved more is
// the one that drives; the first direction past its threshold stays until a hand lets go.
const TWO_SMOOTHING = 0.5;
const TWO_LOCK = 0.15;        // the moving hand travelled this much (× hand size): the direction is decided
const TWO_DEAD_ZONE = 0.003;  // image units: tremor, not a move
export const ZOOM_RATE = 4;   // a tenth of the image height up zooms ×e^0.4 (≈ 1.5)
export const TURN_RATE = 3;   // a tenth of the image width sideways turns 0.3 rad (≈ 17°)

// a, b: the two pinching hands, always in the same order (matchHands). Returns { mode: null | 'zoom' |
// 'rotate', factor (zoom since the last frame, 1 = none), dAngle (turn since the last frame), anchor (the
// holding hand in the window, 0..1) }.
export class TwoHandTracker {
  #s = null; // { start: [p, p], at: [p, p], sent, mode, mover }

  update(a, b) {
    const points = [pinchPoint(a), pinchPoint(b)];
    const size = (handSize(a) + handSize(b)) / 2;
    if (!this.#s) {
      this.#s = { start: points, at: points, sent: null, mode: null, mover: null };
      return { mode: null, factor: 1, dAngle: 0, anchor: toViewport(points[0]) };
    }
    const s = this.#s;
    s.at = s.at.map((p, i) => ({ x: p.x + (points[i].x - p.x) * TWO_SMOOTHING, y: p.y + (points[i].y - p.y) * TWO_SMOOTHING }));
    if (!s.mode) {
      const moved = s.at.map((p, i) => dist(p, s.start[i]) / size);
      const mover = moved[1] >= moved[0] ? 1 : 0;
      if (moved[mover] <= TWO_LOCK) return { mode: null, factor: 1, dAngle: 0, anchor: toViewport(s.at[1 - mover]) };
      const d = { x: s.at[mover].x - s.start[mover].x, y: s.at[mover].y - s.start[mover].y };
      s.mode = Math.abs(d.y) >= Math.abs(d.x) ? 'zoom' : 'rotate';
      s.mover = mover;
      s.sent = { ...s.at[mover] }; // from here on, so the lock itself does not jump
      return { mode: s.mode, factor: 1, dAngle: 0, anchor: toViewport(s.at[1 - mover]) };
    }
    const m = s.mover;
    const anchor = toViewport(s.at[1 - m]);
    if (s.mode === 'zoom') {
      const dy = s.at[m].y - s.sent.y;
      if (Math.abs(dy) < TWO_DEAD_ZONE) return { mode: 'zoom', factor: 1, dAngle: 0, anchor };
      s.sent = { ...s.at[m] };
      return { mode: 'zoom', factor: Math.exp(-dy * ZOOM_RATE), dAngle: 0, anchor }; // up in the image = closer
    }
    const dx = s.at[m].x - s.sent.x;
    if (Math.abs(dx) < TWO_DEAD_ZONE) return { mode: 'rotate', factor: 1, dAngle: 0, anchor };
    s.sent = { ...s.at[m] };
    return { mode: 'rotate', factor: 1, dAngle: -dx * TURN_RATE, anchor }; // mirrored: image left = the person's right
  }

  reset() {
    this.#s = null;
  }
}

const POINTER_SMOOTHING = 0.5;
const POINTER_DEAD_ZONE = 0.004; // window units

// The cursor: the point between thumb and index, mirrored and mapped to the window, smoothed, with a
// dead zone so a resting hand does not shake it. Returns { x, y } (0..1) or null without a hand.
export class PointerTracker {
  #at = null;
  #sent = null;

  update(landmarks) {
    if (!landmarks) return this.reset();
    const p = toViewport(pinchPoint(landmarks));
    if (!this.#at) {
      this.#at = p;
      this.#sent = { ...p };
      return { ...p };
    }
    this.#at = { x: this.#at.x + (p.x - this.#at.x) * POINTER_SMOOTHING, y: this.#at.y + (p.y - this.#at.y) * POINTER_SMOOTHING };
    if (Math.hypot(this.#at.x - this.#sent.x, this.#at.y - this.#sent.y) >= POINTER_DEAD_ZONE) this.#sent = { ...this.#at };
    return { ...this.#sent };
  }

  reset() {
    this.#at = null;
    this.#sent = null;
    return null;
  }
}

export const DWELL_MS = 800;
const DWELL_TOLERANCE = 0.02; // window units the cursor may drift while holding still

// Selecting by holding still: the same target under a still cursor for 800 ms fires once. Moving away,
// another target or none restarts it; after firing, it waits until the cursor leaves that target.
// key: a stable id of what is under the cursor (null = nothing selectable); now: ms.
// ms and tolerance can change (the hands-free settings, spec/004-hands-free-control.md B26).
export class DwellTimer {
  #key = null;
  #since = 0;
  #anchor = null;
  #fired = false;
  #ms;
  #tolerance;

  constructor({ ms = DWELL_MS, tolerance = DWELL_TOLERANCE } = {}) {
    this.#ms = ms;
    this.#tolerance = tolerance;
  }

  configure({ ms, tolerance } = {}) {
    if (Number.isFinite(ms)) this.#ms = ms;
    if (Number.isFinite(tolerance)) this.#tolerance = tolerance;
  }

  update(key, point, now) {
    if (!key) { this.reset(); return { progress: 0, fire: false }; }
    if (key !== this.#key) {
      this.#key = key;
      this.#since = now;
      this.#anchor = point;
      this.#fired = false;
    } else if (Math.hypot(point.x - this.#anchor.x, point.y - this.#anchor.y) > this.#tolerance) {
      this.#since = now;
      this.#anchor = point;
    }
    if (this.#fired) return { progress: 0, fire: false };
    const progress = Math.min(1, (now - this.#since) / this.#ms);
    if (progress < 1) return { progress, fire: false };
    this.#fired = true;
    return { progress: 1, fire: true };
  }

  reset() {
    this.#key = null;
    this.#anchor = null;
    this.#fired = false;
  }
}

// With two open hands, the cursor stays with the hand that had it: MediaPipe does not number hands
// between frames, so "the same hand" is the one whose palm is closest to where it was (D2). Without a
// previous one, the first hand of the frame.
export function pickCursorHand(hands, previousPalm) {
  if (!hands.length) return null;
  if (!previousPalm || hands.length === 1) return hands[0];
  return hands.reduce((best, h) => (dist(palmOf(h), previousPalm) < dist(palmOf(best), previousPalm) ? h : best));
}

// MediaPipe may list the hands in either order from one frame to the next. This keeps each hand in its
// place by where its palm was: { hands (reordered), previous: [slot it had, or -1 if new], palms }.
// A hand the tracker loses for a moment keeps its slot (its last palm is remembered), so when it comes back
// both hands are where they were. With two hands where there was only ever one, that one keeps the first place.
export function matchHands(hands, previousPalms = []) {
  const palms = hands.map(palmOf);
  const swap = () => ({ hands: [hands[1], hands[0]], palms: [palms[1], palms[0]] });
  if (hands.length === 2 && previousPalms.length === 2) {
    const straight = dist(palms[0], previousPalms[0]) + dist(palms[1], previousPalms[1]);
    const crossed = dist(palms[0], previousPalms[1]) + dist(palms[1], previousPalms[0]);
    return { ...(crossed < straight ? swap() : { hands, palms }), previous: [0, 1] };
  }
  if (hands.length === 2 && previousPalms.length === 1) {
    const stayed = dist(palms[0], previousPalms[0]) <= dist(palms[1], previousPalms[0]) ? 0 : 1;
    return { ...(stayed === 0 ? { hands, palms } : swap()), previous: [0, -1] };
  }
  if (hands.length === 1 && previousPalms.length) {
    const slot = previousPalms.length === 2 && dist(palms[0], previousPalms[1]) < dist(palms[0], previousPalms[0]) ? 1 : 0;
    const kept = [...previousPalms];
    kept[slot] = palms[0];
    return { hands, palms: kept, previous: [slot] };
  }
  return { hands, palms, previous: hands.map(() => -1) };
}

export { palmOf };
