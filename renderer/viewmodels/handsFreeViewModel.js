// Using Platanus without hands (spec/004-hands-free-control.md): the camera follows the face, and the person
// points with the eyes or with the head. With the eyes (a webcam trembles ~100 px per frame), holding the gaze
// still opens a magnifier there and, inside it, holding still selects; with the head, holding still selects
// directly. Both pull the ring to the nearest target, keep the hands' rules (never, dialogs) and can pause.
// The long blink is an opt-in shortcut.
// Nothing starts by itself: only the eye button turns the camera on, and the calibration only starts with
// "Empezar". The gaze calibration (models/gazeModel.js): first the position (centered, at a good distance,
// facing the screen), then 9 points, a moment at the center while the head moves a little, 4 test points,
// and a result to accept, repeat, or repeat only the points that went badly. While pointing, a calm filter and a hold keep
// the cursor still while the eyes fixate, and each confirmed selection teaches a small correction.
// What is near a point, clicking it, the magnifier's drawing and the window size belong to the screen: they
// come as `actions` from main.js, so this stays free of DOM. Frames never leave the computer, and only the
// numbers of the adjustments are kept (models/handsFreeSettings.js).
import { Observable } from '../core/observable.js';
import { DwellTimer } from '../models/handGesture.js';
import { PointSampler, HeadPointer, BlinkTracker, longBlinkThreshold, lensGeometry, lensSize, inside, nosePoint } from '../models/faceGesture.js';
import {
  gazeVector, predict, correctModel, implicitCorrection, withAffine, GazeCalibration, FixationSampler, OneEuro, FixationHold,
  positionCheck, CENTER, DARK,
} from '../models/gazeModel.js';
import { analyzeCalibration, formatReport } from '../models/gazeReport.js';

// Slow analysis (B31): under this rate for this long, the card says so
const MIN_FPS = 20;
const SLOW_FOR_MS = 3000;
const FPS_WINDOW_MS = 1000;
// The pull toward the nearest target: a fixed radius with the head; with the eyes, half the measured error
const SNAP_HEAD_PX = 32;
const SNAP_EYES_PX = [32, 96];
// Setting up the long blink: three closings longer than a spontaneous blink
const BLINK_SETUP_COUNT = 3;
const BLINK_SETUP_MIN_MS = 250;
// Implicit recalibration: the gaze of the last moment before a selection, and how many selections it keeps
const RECENT_MS = 400;
const IMPLICIT_KEEP = 30;

// The pages of "Ajustes" (B26), one adjustment each, with big "−" and "+"
export const SETTINGS_PAGES = {
  eyes: ['pointer', 'dwell', 'tolerance', 'smoothing', 'lensFactor', 'pace', 'longBlink'],
  head: ['pointer', 'dwell', 'tolerance', 'smoothing', 'gainLeft', 'gainRight', 'gainUp', 'gainDown', 'headLens', 'longBlink'],
};

const ERRORS = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'noCamera', OverconstrainedError: 'noCamera' };
const IDLE = { face: false, cursor: null, ringAt: null, ring: 0, lens: null, selected: null, selectedKey: null };
const PHASES_OFF = { phase: 'ready', positioning: null, calibration: null, result: null, centering: null, blinkSetup: null };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const noAffine = (model) => ({ ...model, ax: null, ay: null });

export class HandsFreeViewModel {
  #tracking;
  #settings;
  #actions;
  #now;
  #run = 0; // increases each time it turns on or off, so late frames are ignored
  #dwell = new DwellTimer();
  #head = new HeadPointer();
  #blink = new BlinkTracker();
  #euro = new OneEuro();
  #hold = new FixationHold();
  #session = null; // the gaze calibration in course
  #pending = null; // its result, until it is accepted
  #sampler = null; // "Corregir" / "Recentrar" in course
  #blinkDurations = [];
  #recent = []; // [{ t, v }]: the gaze vectors of the last moment
  #implicit = []; // [{ predicted, target, weight }]: what each selection taught (in memory)
  #diagnostics = null; // the last calibration's numbers, for the precision report (B38); forgotten when it turns off
  #zone = { id: 0, armed: true, anchor: null }; // holding the gaze still somewhere (opens the magnifier)
  #justSelected = null; // selected: not again until the point leaves it (B19)
  #hovered = null;
  #frames = [];
  #slowSince = null;

  // status: 'off' | 'starting' | 'on' | 'error'; choosing: the card offers eyes or head (before an opt-in);
  // pointer: 'eyes' | 'head'; phase: 'ready' | 'positioning' | 'calibrating' | 'result' | 'centering' |
  // 'blinkSetup'; positioning: { issue, ok }; calibration: { stage, index, total, point, progress };
  // result: { quality, errorPx, report, rejected, hasBad }; face: a face is in view; cursor / ringAt: { x, y }
  // 0..1 of the window; ring: 0..1; lens: null | { box, origin, source (0..1 of the window), factor }; paused;
  // centering: { progress }; blinkSetup: { count, needed }; errorPx: the gaze's measured error;
  // settingsOpen / settingsKey: the page of "Ajustes"
  store = new Observable({
    status: 'off', error: null, choosing: false, pointer: 'eyes', paused: false, errorPx: null, settingsOpen: false,
    settingsIndex: 0, settingsKey: null, fps: 0, delegate: null, slow: false, light: null, dark: false, cameraSize: null,
    ...PHASES_OFF, ...IDLE,
  });

  // actions: { targetNear(x, y, radiusPx) -> { target: { key, label, selectable, direct?, handsFree? }, at } | null,
  //            anyTargetIn(rect) -> boolean, select(target), hover(target | null, x, y), viewport() -> { width,
  //            height }, stopHands() } with x, y, rect in 0..1 of the window
  constructor({ tracking, settings, actions = {}, now = () => performance.now() }) {
    this.#tracking = tracking;
    this.#settings = settings;
    this.#actions = actions;
    this.#now = now;
    settings.store.subscribe(() => this.#configure(), { immediate: true });
  }

  get on() {
    return this.store.state.status === 'on' || this.store.state.status === 'starting';
  }

  get #s() {
    return this.#settings.store.state;
  }

  // "Suavizado" 0..0.9 -> how calm the gaze is (a lower cutoff is calmer); the hold's radius from the tolerance
  #filterOptions() {
    const s = this.#s;
    return { minCutoff: 0.15 + (1 - s.smoothing) * 0.4, holdRadius: this.#settings.toleranceFor(s.pointer) * 0.7 };
  }

  #configure() {
    const s = this.#s;
    const tolerance = this.#settings.toleranceFor(s.pointer);
    const { minCutoff, holdRadius } = this.#filterOptions();
    this.#dwell.configure({ ms: this.#settings.dwellFor(s.pointer), tolerance });
    this.#head.configure({ gains: this.#settings.gains(), smoothing: s.smoothing });
    this.#euro.configure({ minCutoff });
    this.#hold.configure({ radius: holdRadius });
    this.#blink.setThreshold(s.longBlink ? s.blinkMs : null);
    const patch = {};
    if (s.pointer !== this.store.state.pointer) patch.pointer = s.pointer;
    if (s.errorPx !== this.store.state.errorPx) patch.errorPx = s.errorPx;
    if (Object.keys(patch).length) this.store.set(patch);
  }

  // ---------- On and off ----------

  // Only from the eye button (B1): nothing turns the camera on by itself
  async start() {
    if (!this.#s.optIn || this.on) return;
    this.#actions.stopHands?.(); // one input at a time (B5)
    const run = ++this.#run;
    this.#resetTrackers();
    this.store.set({ status: 'starting', error: null, choosing: false, ...IDLE, ...PHASES_OFF, paused: false, settingsOpen: false, fps: 0, delegate: null, slow: false });
    try {
      await this.#tracking.start((face, info) => { if (run === this.#run) this.#onFrame(face, info); });
      if (run !== this.#run) return;
      this.store.set({ status: 'on' });
      if (this.#s.pointer === 'eyes' && !this.#s.calibration) this.#beginPositioning(); // B6
    } catch (error) {
      if (run !== this.#run) return;
      this.#tracking.stop();
      this.store.set({ status: 'error', error: ERRORS[error?.name] ?? 'failed' });
    }
  }

  // The eye button (for whoever helps, with mouse or keyboard): off -> on with what was chosen before, or the
  // choice of eyes or head in the card the first time; on -> off, keeping the choice and the calibration (B4)
  toggle() {
    if (this.on || this.store.state.status === 'error') return this.stop();
    if (this.store.state.choosing) return this.store.set({ choosing: false });
    if (this.#s.optIn) return this.start();
    this.store.set({ choosing: true });
  }

  async optIn(pointer) {
    this.store.set({ choosing: false });
    this.#settings.optIn(pointer);
    await this.start();
  }

  // Forgets the opt-in and every adjustment (B4)
  optOut() {
    this.stop();
    this.#settings.optOut();
  }

  // B33: everything hidden and released (the opt-in stays: the hands took the camera, or the app is closing)
  stop() {
    this.#run++;
    this.#tracking.stop();
    this.#resetTrackers();
    this.#hover(null);
    this.store.set({ status: 'off', error: null, choosing: false, ...IDLE, ...PHASES_OFF, paused: false, settingsOpen: false, slow: false });
  }

  // B34: the magnifier closes and what was in course is released; it stays on to pick another project
  projectClosed() {
    if (!this.on) return;
    this.#release();
    this.store.set({ lens: null, ring: 0, ringAt: null, selected: null, selectedKey: null });
  }

  #resetTrackers() {
    this.#dwell.reset();
    this.#head.reset();
    this.#blink.reset();
    this.#euro.reset();
    this.#hold.reset();
    this.#session = null;
    this.#pending = null;
    this.#sampler = null;
    this.#blinkDurations = [];
    this.#recent = [];
    this.#implicit = [];
    this.#diagnostics = null;
    this.#zone = { id: this.#zone.id + 1, armed: true, anchor: null };
    this.#justSelected = null;
    this.#frames = [];
    this.#slowSince = null;
  }

  #release() {
    this.#dwell.reset();
    this.#justSelected = null;
    this.#zone = { id: this.#zone.id + 1, armed: true, anchor: null };
    this.#hover(null);
  }

  // ---------- The card's buttons (B24) ----------

  togglePause() {
    if (!this.on) return;
    this.#release();
    this.store.set({ paused: !this.store.state.paused, lens: null, ring: 0, ringAt: null });
  }

  // "Corregir" with the eyes (B8), "Recentrar" with the head (B12): look at / face the center a moment
  center() {
    if (!this.on) return;
    const eyes = this.#s.pointer === 'eyes';
    if (eyes && !this.#s.calibration) return this.#beginPositioning();
    this.#release();
    this.#sampler = eyes ? new FixationSampler({ settleMs: 600, collectMs: 1000 }) : new PointSampler();
    this.store.set({ phase: 'centering', centering: { progress: 0 }, settingsOpen: false, lens: null, cursor: null, ring: 0, ringAt: null });
  }

  recalibrate() {
    if (this.on) this.#beginPositioning();
  }

  // The person (or whoever helps) leaves a positioning, a calibration, a centering or the long-blink setup
  cancelPhase() {
    this.#session = null;
    this.#sampler = null;
    this.#pending = null;
    this.#blinkDurations = [];
    this.#release();
    this.store.set({ ...PHASES_OFF });
  }

  // Eyes or head; switching to the eyes without a calibration starts one
  setPointer(pointer) {
    if (pointer === this.#s.pointer) return;
    this.#settings.setPointer(pointer);
    this.#head.reset();
    this.#euro.reset();
    this.#hold.reset();
    this.#release();
    this.store.set({ lens: null, cursor: null, ring: 0, ringAt: null });
    if (this.on && this.#s.pointer === 'eyes' && !this.#s.calibration) this.#beginPositioning();
  }

  // The long blink (B22): turning it on measures the person's long blinks first
  setLongBlink(on) {
    if (!on) {
      if (this.#s.longBlink) this.#settings.toggle('longBlink');
      return;
    }
    if (this.#s.blinkMs) {
      if (!this.#s.longBlink) this.#settings.toggle('longBlink');
      return;
    }
    this.#release();
    this.#blinkDurations = [];
    this.store.set({ phase: 'blinkSetup', blinkSetup: { count: 0, needed: BLINK_SETUP_COUNT }, settingsOpen: false, lens: null, cursor: null, ring: 0, ringAt: null });
  }

  // ---------- "Ajustes" (B26): one adjustment per page, big "−" / "+" ----------

  #pages() {
    return SETTINGS_PAGES[this.#s.pointer];
  }

  openSettings() {
    this.#release();
    this.store.set({ settingsOpen: true, settingsIndex: 0, settingsKey: this.#pages()[0], lens: null, ring: 0, ringAt: null });
  }

  closeSettings() {
    this.#release();
    this.store.set({ settingsOpen: false });
  }

  settingsMove(direction) {
    const pages = this.#pages();
    const index = (this.store.state.settingsIndex + Math.sign(direction) + pages.length) % pages.length;
    this.store.set({ settingsIndex: index, settingsKey: pages[index] });
  }

  settingsStep(direction) {
    const key = this.store.state.settingsKey;
    const s = this.#s;
    const eyes = s.pointer === 'eyes';
    switch (key) {
      case 'pointer':
        this.store.set({ settingsIndex: 0, settingsKey: 'pointer' });
        return this.setPointer(eyes ? 'head' : 'eyes');
      case 'dwell': return this.#settings.step(eyes ? 'eyesDwellMs' : 'headDwellMs', direction);
      case 'tolerance': return this.#settings.step(eyes ? 'eyesTolerance' : 'headTolerance', direction);
      case 'headLens': return this.#settings.toggle('headLens');
      case 'longBlink': return this.setLongBlink(!s.longBlink);
      default: return this.#settings.step(key, direction);
    }
  }

  // ---------- The calibration: position, points, result ----------

  #beginPositioning() {
    this.#release();
    this.#session = null;
    this.#pending = null;
    this.store.set({ ...PHASES_OFF, phase: 'positioning', positioning: { issue: 'noFace', ok: false }, settingsOpen: false, lens: null, cursor: null, ring: 0, ringAt: null });
  }

  // "Empezar" (or "Empezar igual" when the position is not right): the points start only from here
  startCalibration() {
    if (this.on) this.#beginCalibration();
  }

  #beginCalibration({ base = [], points = null } = {}) {
    const viewport = this.#actions.viewport?.() ?? { width: 1, height: 1 };
    this.#release();
    this.#session = new GazeCalibration({ viewport, pace: this.#s.pace, base, points });
    this.store.set({
      ...PHASES_OFF, phase: 'calibrating', settingsOpen: false, lens: null, cursor: null, ring: 0, ringAt: null,
      calibration: { stage: 'points', index: 0, total: points?.length ?? 9, point: this.#session.point, progress: 0 },
    });
  }

  // The result's buttons
  acceptCalibration() {
    const done = this.#pending;
    if (!done?.model) return;
    this.#settings.saveCalibration(done.model, done.errorPx);
    this.#pending = null;
    this.#implicit = [];
    this.#euro.reset();
    this.#hold.reset();
    this.#release();
    this.store.set({ ...PHASES_OFF });
  }

  repeatCalibration() {
    if (this.on) this.#beginPositioning();
  }

  repeatBadPoints() {
    const done = this.#pending;
    const bad = done?.report.filter((r) => r.bad).map((r) => r.target) ?? [];
    if (!done?.model || !bad.length) return this.repeatCalibration();
    this.#beginCalibration({ base: done.samples, points: bad });
  }

  // The precision report (B38, only offered in npm run dev): the last calibration's numbers as text, or null.
  // screen: the display's size in CSS px (to turn px into degrees). Nothing from the face itself is in it.
  report({ screen } = {}) {
    if (!this.#diagnostics) return null;
    const s = this.#s, st = this.store.state;
    const { minCutoff, holdRadius } = this.#filterOptions();
    const vp = this.#actions.viewport?.() ?? this.#diagnostics.viewport;
    const distances = this.#implicit.map(({ predicted, target }) => Math.hypot((target.x - predicted.x) * vp.width, (target.y - predicted.y) * vp.height));
    const sorted = [...distances].sort((a, b) => a - b);
    return formatReport(analyzeCalibration(this.#diagnostics, {
      screen, filter: { minCutoff }, holdRadius,
      live: { fps: st.fps, delegate: st.delegate, cameraSize: st.cameraSize, light: st.light },
      settings: { pointer: s.pointer, pace: s.pace, smoothing: s.smoothing, dwellMs: this.#settings.dwellFor(s.pointer), tolerance: this.#settings.toleranceFor(s.pointer), lensFactor: s.lensFactor },
      implicit: { count: distances.length, medianPx: sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN, ax: s.calibration?.ax, ay: s.calibration?.ay },
    }));
  }

  // ---------- Frames ----------

  // face: { landmarks, blendshapes, matrix } or null (no face in view)
  #onFrame(face, info = {}) {
    const now = info.now ?? this.#now();
    this.#measure(now, info.delegate);
    this.#lighting(info);
    const st = this.store.state;
    if (st.phase === 'positioning') return this.#position(face);
    if (st.phase === 'calibrating') return this.#calibrate(face, now);
    if (!face) {
      // B13: no cursor, no ring, no magnifier
      this.#release();
      this.#blink.reset();
      this.#euro.reset();
      this.#hold.reset();
      this.#recent = [];
      return this.#patch({ face: false, cursor: null, ringAt: null, ring: 0, lens: null });
    }
    const blink = this.#blink.update(face, now);
    if (st.phase === 'blinkSetup') return this.#setUpBlink(blink);
    const eyes = this.#s.pointer === 'eyes';
    const v = eyes ? gazeVector(face) : null;
    if (st.phase === 'centering') return this.#centerStep(eyes ? v : nosePoint(face), now);
    let cursor;
    if (eyes) {
      const model = st.phase === 'result' ? this.#pending?.model : this.#s.calibration;
      if (v) {
        this.#recent.push({ t: now, v });
        while (this.#recent.length && this.#recent[0].t < now - RECENT_MS) this.#recent.shift();
      }
      // B10: with the eyes closed the cursor waits where it was
      const raw = v && model ? predict(model, v) : null;
      cursor = raw ? this.#hold.update(this.#euro.update(raw, now), now) : st.cursor;
    } else {
      cursor = this.#head.update(face);
    }
    if (!cursor) return this.#patch({ face: true, cursor: null, ringAt: null, ring: 0 });
    return this.#point(cursor, blink, now);
  }

  // The card says what to fix; it never starts the points by itself
  #position(face) {
    const check = positionCheck(face, { light: this.store.state.light });
    const st = this.store.state.positioning;
    if (st?.issue === check.issue && st?.ok === check.ok && this.store.state.face === Boolean(face)) return;
    this.store.set({ face: Boolean(face), positioning: { issue: check.issue, ok: check.ok } });
  }

  #calibrate(face, now) {
    const r = this.#session.update(face ? gazeVector(face) : null, now);
    if (r.done) {
      const d = r.done;
      this.#session = null;
      this.#pending = d.rejected ? null : d;
      this.#diagnostics = d.diagnostics ?? null; // kept even when rejected: that is when it is most needed
      this.#euro.reset();
      this.#hold.reset();
      const report = d.report.map(({ target, predicted, errorPx, bad }) => ({ target, predicted, errorPx, bad }));
      return this.store.set({
        ...PHASES_OFF, phase: 'result', face: Boolean(face),
        result: { quality: d.quality, errorPx: d.errorPx, report, rejected: d.rejected, hasBad: report.some((x) => x.bad) },
      });
    }
    this.store.set({ face: Boolean(face), calibration: { stage: r.stage, index: r.index, total: r.total, point: r.point, progress: r.progress } });
  }

  #point(cursor, blink, now) {
    const s = this.#s, st = this.store.state;
    const usesLens = s.pointer === 'eyes' || s.headLens;
    const radius = s.pointer === 'eyes' ? clamp((s.errorPx ?? 64) * 0.5, ...SNAP_EYES_PX) : SNAP_HEAD_PX;
    const near = this.#actions.targetNear?.(cursor.x, cursor.y, radius) ?? null;
    let target = near?.target ?? null;
    // Modal moments answer only their own buttons: the calibration's result, "Seguir" in pause (B25),
    // "Ajustes" while it is open
    if (st.phase === 'result' && target?.handsFree !== 'calibration') target = null;
    if (st.paused && target?.handsFree !== 'pause') target = null;
    if (st.settingsOpen && target?.handsFree !== 'settings') target = null;
    if (target && !target.selectable) target = null; // never, a dialog, a text field: no ring (B27)
    const modal = st.paused || st.settingsOpen || st.phase === 'result';

    if (st.lens) {
      if (!inside(st.lens.box, cursor)) {
        // B16: looking out of the magnifier closes it, selecting nothing
        this.#disarmZone(cursor);
        this.#dwell.reset();
        return this.#patch({ face: true, cursor, lens: null, ring: 0, ringAt: null });
      }
      return this.#dwellOn(target, near, cursor, blink, now);
    }
    if (target?.direct || !usesLens || modal) return this.#dwellOn(target, near, cursor, blink, now);

    // With the eyes: holding the gaze still anywhere there is something to select opens the magnifier (B14)
    this.#hover(null);
    if (!this.#zone.armed) {
      if (dist(cursor, this.#zone.anchor) <= this.#settings.toleranceFor(s.pointer)) return this.#patch({ face: true, cursor, ring: 0, ringAt: null });
      this.#zone = { id: this.#zone.id + 1, armed: true, anchor: null };
    }
    const dwell = this.#dwell.update(`zone:${this.#zone.id}`, cursor, now);
    if (dwell.fire || blink.long) {
      this.#disarmZone(cursor);
      this.#dwell.reset();
      const lens = this.#lensAt(cursor);
      if (lens && this.#actions.anyTargetIn?.(lens.source)) return this.#patch({ face: true, cursor, lens, ring: 0, ringAt: null });
      return this.#patch({ face: true, cursor, ring: 0, ringAt: null });
    }
    return this.#patch({ face: true, cursor, ring: dwell.progress, ringAt: cursor, selected: null, selectedKey: null });
  }

  // Holding still (or a long blink) on a target selects it like a click (B15, B17, B19, B20, B23)
  #dwellOn(target, near, cursor, blink, now) {
    const st = this.store.state;
    const key = target?.key ?? null;
    if (!st.lens) this.#hover(target);
    if (key !== this.#justSelected) this.#justSelected = null;
    let { progress, fire } = this.#dwell.update(this.#justSelected ? null : key, cursor, now);
    if (!fire && blink.long && target && !this.#justSelected) fire = true;
    let { selected, selectedKey, lens } = st;
    if (fire) {
      if (st.phase === 'ready' && near?.at) this.#learn(near.at);
      this.#actions.select?.(target);
      selected = target.label ?? null;
      selectedKey = key;
      this.#justSelected = key;
      this.#dwell.reset();
      if (lens) {
        lens = null;
        this.#disarmZone(cursor); // the magnifier does not open again until the gaze moves
      }
    } else if (selectedKey && key !== selectedKey) {
      selected = null;
      selectedKey = null;
    }
    return this.#patch({ face: true, cursor, lens, ring: fire ? 0 : progress, ringAt: target && near ? near.at : null, selected, selectedKey });
  }

  // Implicit recalibration: where the gaze was just before a confirmed selection, against where the target
  // is, teaches a small correction (kept as numbers with the calibration); only plausible selections count,
  // and a stretch only once they cover the screen (gazeModel.implicitCorrection)
  #learn(target) {
    const model = this.#s.calibration;
    if (this.#s.pointer !== 'eyes' || !model || !this.#recent.length) return;
    const ps = this.#recent.map(({ v }) => predict(noAffine(model), v));
    const predicted = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
    this.#implicit.push({ predicted, target, weight: 1 });
    if (this.#implicit.length > IMPLICIT_KEEP) this.#implicit.shift();
    const viewport = this.#actions.viewport?.();
    this.#settings.saveCalibration(withAffine(model, implicitCorrection(this.#implicit, { viewport, errorPx: this.#s.errorPx })), this.#s.errorPx);
  }

  #disarmZone(cursor) {
    this.#zone = { id: this.#zone.id + 1, armed: false, anchor: { ...cursor } };
  }

  // The magnifier around the gaze, as fractions of the window
  #lensAt(cursor) {
    const vp = this.#actions.viewport?.();
    if (!vp?.width || !vp?.height) return null;
    const size = lensSize(this.#s.errorPx, vp);
    const g = lensGeometry({ x: cursor.x * vp.width, y: cursor.y * vp.height }, { factor: this.#s.lensFactor, size }, vp);
    const rect = (r) => ({ x: r.x / vp.width, y: r.y / vp.height, w: r.w / vp.width, h: r.h / vp.height });
    return { box: rect(g.box), source: rect(g.source), origin: { x: g.origin.x / vp.width, y: g.origin.y / vp.height }, factor: g.factor };
  }

  // ---------- Centering, the long blink ----------

  #centerStep(value, now) {
    const r = this.#sampler.update(value, now);
    if (!r.done) return this.#patch({ face: true, centering: { progress: r.progress }, cursor: null, ring: 0, ringAt: null });
    if (this.#s.pointer === 'eyes') {
      const vs = r.done.vectors;
      if (vs.length) {
        const mean = vs[0].map((_, j) => vs.reduce((s, v) => s + v[j], 0) / vs.length);
        this.#settings.saveCalibration(correctModel(this.#s.calibration, mean, CENTER), this.#s.errorPx);
        this.#implicit = []; // what it taught was relative to the old shift
      }
    } else {
      this.#head.recenter(r.done);
    }
    this.#sampler = null;
    this.#euro.reset();
    this.#hold.reset();
    this.store.set({ phase: 'ready', centering: null });
  }

  #setUpBlink(blink) {
    if (blink.ended && blink.ended >= BLINK_SETUP_MIN_MS) this.#blinkDurations.push(blink.ended);
    const count = this.#blinkDurations.length;
    if (count < BLINK_SETUP_COUNT) return this.#patch({ face: true, blinkSetup: { count, needed: BLINK_SETUP_COUNT }, cursor: null, ring: 0 });
    this.#settings.saveBlink(longBlinkThreshold(this.#blinkDurations));
    if (!this.#s.longBlink) this.#settings.toggle('longBlink');
    this.#blinkDurations = [];
    this.store.set({ phase: 'ready', blinkSetup: null });
  }

  // ---------- Helpers ----------

  #hover(target) {
    const key = target?.key ?? null;
    if (key === this.#hovered) return;
    this.#hovered = key;
    const c = this.store.state.cursor;
    this.#actions.hover?.(target, c?.x, c?.y);
  }

  #patch(patch) {
    const s = this.store.state;
    if (Object.keys(patch).some((k) => patch[k] !== s[k])) this.store.set(patch);
  }

  // The light measured by the service (B37) and the camera's real size (dev), only when they change
  #lighting({ light, size } = {}) {
    const st = this.store.state;
    const patch = {};
    if (Number.isFinite(light) && light !== st.light) {
      patch.light = light;
      if ((light < DARK) !== st.dark) patch.dark = light < DARK;
    }
    if (size?.width && (size.width !== st.cameraSize?.width || size.height !== st.cameraSize?.height)) patch.cameraSize = { width: size.width, height: size.height };
    if (Object.keys(patch).length) this.store.set(patch);
  }

  // Frames per second over the last second; too slow for too long is told (B31)
  #measure(now, delegate) {
    this.#frames.push(now);
    while (this.#frames.length && this.#frames[0] < now - FPS_WINDOW_MS) this.#frames.shift();
    const elapsed = now - this.#frames[0];
    const fps = this.#frames.length > 1 && elapsed > 0 ? Math.round(((this.#frames.length - 1) * 1000) / elapsed) : this.store.state.fps;
    const patch = {};
    if (fps !== this.store.state.fps) patch.fps = fps;
    if (delegate && delegate !== this.store.state.delegate) patch.delegate = delegate;
    if (this.#frames.length > 1 && fps < MIN_FPS) {
      this.#slowSince ??= now;
      if (now - this.#slowSince >= SLOW_FOR_MS && !this.store.state.slow) patch.slow = true;
    } else if (fps >= MIN_FPS) {
      this.#slowSince = null;
      if (this.store.state.slow) patch.slow = false;
    }
    if (Object.keys(patch).length) this.store.set(patch);
  }
}
