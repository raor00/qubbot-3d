// What the hands-free control remembers on this computer (spec/004-hands-free-control.md): whether someone
// turned it on (the opt-in), how the person points (eyes or head) and their adjustments. Only numbers, yes /
// no and the pointer: never images, points of the face, blendshapes or where the person looked (B28).
// Whatever is read back is checked first (a damaged or edited value falls back to its default).
import { Observable } from '../core/observable.js';
import { FEATURE_COUNT } from './gazeModel.js';

export const STORAGE_KEY = 'platanus.handsFree.v1';
export const POINTERS = ['eyes', 'head'];

// key: [min, max, step]; the hold-still time starts at 1 s with the eyes and 0.8 s with the head (D2)
export const RANGES = {
  eyesDwellMs: [500, 3000, 250],
  headDwellMs: [500, 3000, 250],
  eyesTolerance: [0.01, 0.12, 0.01],
  headTolerance: [0.01, 0.12, 0.01],
  smoothing: [0, 0.9, 0.1],
  lensFactor: [2, 6, 0.5],
  gainLeft: [1, 10, 0.5],
  gainRight: [1, 10, 0.5],
  gainUp: [1, 10, 0.5],
  gainDown: [1, 10, 0.5],
  pace: [1, 2.5, 0.5], // the calibration's pace: 1 normal, up to 2.5 times slower (slow saccades, as in ALS)
};
const BOOLEANS = ['optIn', 'headLens', 'longBlink'];

export const DEFAULTS = {
  optIn: false,
  pointer: 'eyes',
  eyesDwellMs: 1000,
  headDwellMs: 800,
  eyesTolerance: 0.05,
  headTolerance: 0.02,
  smoothing: 0.6,
  lensFactor: 4,
  gainLeft: 4,
  gainRight: 4,
  gainUp: 4,
  gainDown: 4,
  pace: 1,
  headLens: false,
  longBlink: false,
  blinkMs: null,
  calibration: null,
  errorPx: null,
};

const round = (v, step) => Math.round(v / step) * step;
const tidy = (v) => Math.round(v * 1000) / 1000; // 0.1 + 0.2 stays 0.3

// The gaze model's numbers (models/gazeModel.js, v2): anything else (an old kind of calibration, samples,
// stray fields) is dropped, and the person calibrates again
const numbers = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const TERMS = { 0: FEATURE_COUNT + 1, 1: FEATURE_COUNT + 7 };
function cleanCalibration(c) {
  if (!c || typeof c !== 'object' || c.v !== 2 || !(c.kind in TERMS)) return null;
  const p = TERMS[c.kind];
  const ok = numbers(c.mean, FEATURE_COUNT) && numbers(c.std, FEATURE_COUNT) && numbers(c.cx, p) && numbers(c.cy, p)
    && Number.isFinite(c.ox) && Number.isFinite(c.oy) && numbers(c.ax, 3) && numbers(c.ay, 3);
  if (!ok) return null;
  return { v: 2, kind: c.kind, mean: [...c.mean], std: [...c.std], cx: [...c.cx], cy: [...c.cy], ox: c.ox, oy: c.oy, ax: [...c.ax], ay: [...c.ay] };
}

// Any object -> a valid settings object with exactly the known keys
export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULTS };
  for (const key of BOOLEANS) if (typeof r[key] === 'boolean') out[key] = r[key];
  if (POINTERS.includes(r.pointer)) out.pointer = r.pointer;
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (typeof r[key] === 'number' && Number.isFinite(r[key])) out[key] = tidy(Math.min(max, Math.max(min, r[key])));
  }
  if (typeof r.blinkMs === 'number' && Number.isFinite(r.blinkMs)) out.blinkMs = Math.round(Math.min(5000, Math.max(300, r.blinkMs)));
  if (typeof r.errorPx === 'number' && Number.isFinite(r.errorPx) && r.errorPx >= 0) out.errorPx = Math.round(Math.min(5000, r.errorPx));
  out.calibration = cleanCalibration(r.calibration);
  return out;
}

export class HandsFreeSettings {
  #storage;
  store;

  constructor({ storage = globalThis.localStorage } = {}) {
    this.#storage = storage;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null'); } catch { saved = null; }
    this.store = new Observable(sanitize(saved));
  }

  dwellFor(pointer) {
    return pointer === 'head' ? this.store.state.headDwellMs : this.store.state.eyesDwellMs;
  }

  toleranceFor(pointer) {
    return pointer === 'head' ? this.store.state.headTolerance : this.store.state.eyesTolerance;
  }

  gains() {
    const s = this.store.state;
    return { left: s.gainLeft, right: s.gainRight, up: s.gainUp, down: s.gainDown };
  }

  optIn(pointer) {
    this.#set({ optIn: true, pointer: POINTERS.includes(pointer) ? pointer : 'eyes' });
  }

  // Forgets everything, the calibration too (B4)
  optOut() {
    try { this.#storage?.removeItem(STORAGE_KEY); } catch { /* private mode */ }
    this.store.set({ ...DEFAULTS });
  }

  setPointer(pointer) {
    if (POINTERS.includes(pointer)) this.#set({ pointer });
  }

  step(key, direction) {
    const range = RANGES[key];
    if (!range) return;
    const [min, max, step] = range;
    const next = tidy(round(this.store.state[key] + Math.sign(direction) * step, step));
    this.#set({ [key]: Math.min(max, Math.max(min, next)) });
  }

  toggle(key) {
    if (BOOLEANS.includes(key) && key !== 'optIn') this.#set({ [key]: !this.store.state[key] });
  }

  saveCalibration(model, errorPx) {
    this.#set({ calibration: cleanCalibration(model), errorPx: Number.isFinite(errorPx) ? Math.round(errorPx) : null });
  }

  saveBlink(ms) {
    this.#set({ blinkMs: ms });
  }

  #set(patch) {
    const next = sanitize({ ...this.store.state, ...patch });
    this.store.set(next);
    if (!next.optIn) return; // nothing is written before someone opts in
    try { this.#storage?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full or private mode */ }
  }
}
