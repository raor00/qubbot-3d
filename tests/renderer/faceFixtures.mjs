// Synthetic faces for the hands-free tests (spec/004-hands-free-control.md): MediaPipe's face landmarks in
// image coordinates (0..1, x to the right of the image, y down) and the two blink blendshapes. Only the
// points the models read are placed; the rest sit at the middle of the image.
//
// The person looks at a window point `look` (0..1 as they see the window). The camera faces them, so looking
// to their right moves the iris to the image's left. `nose` moves the whole face (the head) in the image.
// `bias` shifts both irises a little, as when the head moved after calibrating.
import { FACE_POINTS as P } from '../../renderer/models/faceGesture.js';

const LANDMARKS = 478;
const EYE_HALF = 0.03; // half the width of each eye, corner to corner (image units)
const LID = 0.012; // eyelids above and below the eye's center
const IRIS_X = 0.02; // the iris moves this much across the eye for the whole window width
const IRIS_Y = 0.008; // and this much up and down for the whole window height
const REST_NOSE = { x: 0.5, y: 0.55 };

export const VIEWPORT = { width: 1000, height: 800 };

export function face({ look = { x: 0.5, y: 0.5 }, nose = REST_NOSE, blink = {}, bias = { x: 0, y: 0 } } = {}) {
  const shift = { x: nose.x - REST_NOSE.x, y: nose.y - REST_NOSE.y };
  const points = Array.from({ length: LANDMARKS }, () => ({ x: 0.5 + shift.x, y: 0.5 + shift.y, z: 0 }));
  const at = (index, x, y) => { points[index] = { x: x + shift.x, y: y + shift.y, z: 0 }; };
  // A little curve, like a real eye: the iris moves less near the corners
  const lx = look.x - 0.5, ly = look.y - 0.5;
  const dx = -lx * IRIS_X + 0.004 * lx * lx + bias.x;
  const dy = ly * IRIS_Y + 0.002 * lx * ly + bias.y;
  for (const [side, cx] of [['right', 0.42], ['left', 0.58]]) {
    const cy = 0.45;
    const outer = side === 'right' ? cx - EYE_HALF : cx + EYE_HALF;
    const inner = side === 'right' ? cx + EYE_HALF : cx - EYE_HALF;
    at(P[`${side}Outer`], outer, cy);
    at(P[`${side}Inner`], inner, cy);
    at(P[`${side}Upper`], cx, cy - LID);
    at(P[`${side}Lower`], cx, cy + LID);
    at(P[`${side}Iris`], cx + dx, cy + dy);
  }
  at(P.noseTip, REST_NOSE.x, REST_NOSE.y);
  return { landmarks: points, blendshapes: { eyeBlinkLeft: blink.left ?? 0, eyeBlinkRight: blink.right ?? 0 } };
}

// Both eyes closed (a blink), looking wherever it was
export const closed = (options = {}) => face({ ...options, blink: { left: 0.9, right: 0.9 } });

// The head turned to the person's right moves the nose to the image's left
export const headAt = (dx, dy) => face({ nose: { x: REST_NOSE.x + dx, y: REST_NOSE.y + dy } });

// A tiny deterministic tremor
export const jitter = (i, amount = 0.002) => (i % 2 ? amount : -amount);

// ---------- A realistic person, for the gaze calibration (spec/004, calibration v2) ----------
// A 13" laptop (29 × 19 cm) at 60 cm, a 640 px camera with ~60° of view (69 cm wide at 60 cm). The person
// looks at a window point `look`; the head may be turned (yaw: to the person's right, pitch: down, degrees)
// and moved (x: to the person's right, y: down, cm). The eye turns whatever the head did not; the iris moves
// 1.2 cm × sin(angle) inside a 3 cm wide eye; looking down narrows the lids. MediaPipe's tremor is `noisePx`
// (px of the camera image) on every point; its own gaze guess (eyeLook*) follows the eye's rotation.
import { gazeVector } from '../../renderer/models/gazeModel.js';

const SCREEN = { w: 29, h: 19, d: 60 };
const EYE_R = 1.2, EYE_W = 3.0, EYE_GAP = 3.2, LIDS_CM = 1.0;
const IMG_W = 640;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clampAbs = (v, m = 1) => Math.max(-m, Math.min(m, v));

// Deterministic noise with a standard deviation of ~1
function rand(i, k, seed) {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(k + 1, 668265263) + Math.imul(seed, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const noise = (i, k, seed = 7) => (rand(i, k, seed) + rand(i, k + 7, seed) + rand(i, k + 13, seed) - 1.5) * 2;

// Column-major 4×4 of a turn (yaw around y, then pitch around x) and a translation (cm)
function poseMatrix(yaw, pitch, t) {
  const cy = Math.cos(rad(yaw)), sy = Math.sin(rad(yaw)), cp = Math.cos(rad(pitch)), sp = Math.sin(rad(pitch));
  const R = [[cy, sy * sp, sy * cp], [0, cp, -sp], [-sy, cy * sp, cy * cp]];
  return [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1];
}

export function person({ look = { x: 0.5, y: 0.5 }, head = {}, noisePx = 0, lookNoise = 0, i = 0, seed = 7, blink = {}, distance = SCREEN.d, wild = false } = {}) {
  const yaw = head.yaw ?? 0, pitch = head.pitch ?? 0, hx = head.x ?? 0, hy = head.y ?? 0;
  const frameW = 69 * (distance / SCREEN.d), frameH = frameW * 0.75;
  const cmX = 1 / frameW, cmY = 1 / frameH;
  // Where the eyes point (from where the head is), and how much the eyes turn inside the head
  const tx = Math.atan(((look.x - 0.5) * SCREEN.w - hx) / distance);
  const ty = Math.atan(((look.y - 0.5) * SCREEN.h - hy) / distance);
  const ax = tx - rad(yaw), ay = ty - rad(pitch);
  const jx = noisePx / IMG_W, jy = noisePx / (IMG_W * 0.75);
  const n = (k, s) => (s ? s * noise(i, k, seed) : 0);
  // The face in the image: the person's right is the image's left
  const cx = 0.5 - hx * cmX - Math.sin(rad(yaw)) * 1.0 * cmX;
  const cy = 0.45 + hy * cmY + Math.sin(rad(pitch)) * 1.0 * cmY;
  const points = Array.from({ length: 478 }, () => ({ x: cx, y: cy, z: 0 }));
  const at = (index, x, y, k) => { points[index] = { x: x + n(k, jx), y: y + n(k + 500, jy), z: 0 }; };
  let k = 0;
  for (const [side, offset] of [['right', -EYE_GAP], ['left', EYE_GAP]]) {
    const ex = cx + offset * cmX, ey = cy;
    const half = (EYE_W / 2) * cmX;
    at(P[`${side}Outer`], side === 'right' ? ex - half : ex + half, ey, k++);
    at(P[`${side}Inner`], side === 'right' ? ex + half : ex - half, ey, k++);
    const open = LIDS_CM * (1 - 0.35 * Math.sin(ay)) * (1 - (blink[side] ?? 0));
    at(P[`${side}Upper`], ex, ey - (open / 2) * cmY, k++);
    at(P[`${side}Lower`], ex, ey + (open / 2) * cmY, k++);
    const wildX = wild ? 0.5 * EYE_W * cmX : 0;
    at(P[`${side}Iris`], ex - EYE_R * Math.sin(ax) * cmX + wildX, ey + 0.8 * EYE_R * Math.sin(ay) * cmY, k++);
  }
  at(P.noseTip, cx - Math.sin(rad(yaw)) * 1.5 * cmX, cy + 2.5 * cmY + Math.sin(rad(pitch)) * 1.5 * cmY, k++);
  // MediaPipe's own guess of the eye's rotation (in the person's terms): coarse, saturating, a little biased,
  // and weaker up and down than sideways
  const lx = clampAbs(0.6 * Math.tanh(deg(ax) / 20) + 0.05 + n(900, lookNoise));
  const ly = clampAbs(0.4 * Math.tanh(deg(ay) / 15) - 0.03 + n(901, lookNoise * 1.3));
  const pos = (v) => Math.max(0, v);
  const blendshapes = {
    eyeBlinkLeft: blink.left ?? 0, eyeBlinkRight: blink.right ?? 0,
    eyeLookOutRight: pos(lx), eyeLookInLeft: pos(lx), eyeLookInRight: pos(-lx), eyeLookOutLeft: pos(-lx),
    eyeLookDownLeft: pos(ly), eyeLookDownRight: pos(ly), eyeLookUpLeft: pos(-ly), eyeLookUpRight: pos(-ly),
  };
  return { landmarks: points, blendshapes, matrix: poseMatrix(yaw, pitch, [hx, -hy, -distance]) };
}

// Runs a gaze calibration with a person who follows each new point `delay` ms late (a saccade and its
// reaction time). head(t, state) can move the head; wild(i) makes a frame an outlier.
export function runCalibration(session, { delay = 450, step = 33, noisePx = 0.8, lookNoise = 0.08, head = () => ({}), wild = () => false, seed = 7, max = 6000, mirror = false } = {}) {
  let t = 0, looking = session.point, last = session.point, changedAt = 0;
  let state = session.update(null, t);
  for (let i = 0; i < max && !state.done; i++) {
    t += step;
    if (session.point !== last) { last = session.point; changedAt = t; }
    if (t - changedAt >= delay) looking = last;
    const look = mirror ? { x: 1 - looking.x, y: looking.y } : looking;
    state = session.update(gazeVector(person({ look, head: head(t, state), noisePx, lookNoise, i, seed, wild: wild(i) })), t);
  }
  return { ...state, ms: t };
}
