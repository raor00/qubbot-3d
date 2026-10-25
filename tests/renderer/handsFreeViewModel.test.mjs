// The hands-free view model (spec/004-hands-free-control.md): turning it on and off, calibrating the gaze,
// pointing with the eyes or the head, the magnifier, the long blink, the pause and the adjustments. The
// screen side (what is near a point, clicking it, the window size) comes as fake actions, with targets as
// rectangles in pixels of a 1000 × 800 window.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandsFreeViewModel } from '../../renderer/viewmodels/handsFreeViewModel.js';
import { HandsFreeSettings } from '../../renderer/models/handsFreeSettings.js';
import { nearestTarget } from '../../renderer/models/faceGesture.js';
import { GazeCalibration } from '../../renderer/models/gazeModel.js';
import { closed, headAt, person, runCalibration, VIEWPORT as VP } from './faceFixtures.mjs';

const CENTER = { key: 'risks', kind: 'ui', label: 'Riesgos', selectable: true, rect: { x: 480, y: 380, w: 40, h: 40 } };
const PAUSE = { key: 'hf-pause', kind: 'ui', label: 'Pausa', selectable: true, direct: true, handsFree: 'pause', rect: { x: 860, y: 680, w: 120, h: 100 } };
const NEVER = { key: 'repair', kind: 'ui', label: 'Reparar', selectable: false, blocked: true, rect: { x: 480, y: 380, w: 40, h: 40 } };

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// One calibration for the eyes' tests (a realistic person, little tremor), done once
let cached = null;
const calibration = () => (cached ??= runCalibration(new GazeCalibration({ viewport: VP }), { noisePx: 0.3, lookNoise: 0.03 }).done.model);
// The person looking at a window point (still: no tremor), or with the eyes closed
const look = (x, y) => person({ look: { x, y } });
const shut = (x, y) => person({ look: { x, y }, blink: { left: 0.9, right: 0.9 } });

function setup({ pointer = 'head', calibrated = true, targets = [CENTER, PAUSE], optIn = true, fail = null } = {}) {
  const now = { t: 0 };
  const settings = new HandsFreeSettings({ storage: memoryStorage() });
  if (optIn) settings.optIn(pointer);
  if (calibrated && pointer === 'eyes') settings.saveCalibration(calibration(), 100);
  let onFace = null;
  const tracking = {
    started: 0, stopped: 0,
    async start(cb) { this.started++; if (fail) throw Object.assign(new Error('no'), { name: fail }); onFace = cb; },
    stop() { this.stopped++; onFace = null; },
  };
  const calls = { selected: [], stopHands: 0 };
  const px = (x, y) => ({ x: x * VP.width, y: y * VP.height });
  const overlaps = (r, n) => r.x < (n.x + n.w) * VP.width && r.x + r.w > n.x * VP.width && r.y < (n.y + n.h) * VP.height && r.y + r.h > n.y * VP.height;
  const actions = {
    viewport: () => VP,
    targetNear(x, y, radius) {
      const t = nearestTarget(px(x, y), targets, radius);
      return t ? { target: t, at: { x: (t.rect.x + t.rect.w / 2) / VP.width, y: (t.rect.y + t.rect.h / 2) / VP.height } } : null;
    },
    anyTargetIn: (rect) => targets.some((t) => t.selectable && !t.direct && overlaps(t.rect, rect)),
    select: (t) => calls.selected.push(t.key),
    hover: () => {},
    stopHands: () => calls.stopHands++,
  };
  const vm = new HandsFreeViewModel({ tracking, settings, actions, now: () => now.t });
  const send = (f, info = {}) => onFace?.(f, { now: now.t, delegate: 'GPU', ...info });
  // Sends the same frame (or a function of the elapsed ms) every 33 ms for `ms`
  const hold = (frame, ms, step = 33) => {
    for (let e = 0; e <= ms; e += step) { now.t += step; send(typeof frame === 'function' ? frame(e) : frame); }
  };
  return { vm, settings, tracking, calls, send, hold, now, state: () => vm.store.state };
}

test('without an opt-in it does not start; opting in starts it, and opting out stops it and forgets it (B1, B2, B4)', async () => {
  const off = setup({ optIn: false });
  await off.vm.start();
  assert.equal(off.tracking.started, 0);
  assert.equal(off.state().status, 'off');
  await off.vm.optIn('head');
  assert.equal(off.tracking.started, 1);
  assert.equal(off.state().status, 'on');
  assert.equal(off.state().pointer, 'head');
  off.vm.optOut();
  assert.equal(off.tracking.stopped, 1);
  assert.equal(off.state().status, 'off');
  assert.equal(off.settings.store.state.optIn, false);
});

test('one input at a time: starting it turns the hands off (B5)', async () => {
  const { vm, calls } = setup();
  await vm.start();
  assert.equal(calls.stopHands, 1);
});

test('a camera error is told, like with the hands', async () => {
  const { vm, state } = setup({ fail: 'NotAllowedError' });
  await vm.start();
  assert.deepEqual([state().status, state().error], ['error', 'denied']);
});

test('the eye button: off, it offers eyes or head in the card; choosing starts it; on, it turns it off and keeps the calibration', async () => {
  const { vm, state, tracking, settings } = setup({ optIn: false });
  vm.toggle();
  assert.equal(state().choosing, true);
  assert.equal(tracking.started, 0);
  await vm.optIn('head');
  assert.deepEqual([state().choosing, state().status], [false, 'on']);
  vm.toggle();
  assert.equal(state().status, 'off');
  assert.equal(settings.store.state.pointer, 'head', 'the choice is remembered');
  await vm.toggle();
  assert.equal(state().status, 'on', 'next time the eye starts it with what was chosen, without asking again');
});

test('nothing turns on by itself: only the eye button starts the camera (B1)', async () => {
  const { vm, tracking, state } = setup({ pointer: 'eyes' });
  assert.equal(tracking.started, 0);
  assert.equal(state().status, 'off');
  await vm.toggle();
  assert.equal(tracking.started, 1);
});

test('with the eyes and no calibration: the card checks the position, and the points only start with "Empezar" (B6)', async () => {
  const { vm, hold, state } = setup({ pointer: 'eyes', calibrated: false });
  await vm.start();
  assert.equal(state().phase, 'positioning');
  hold(person({ distance: 120 }), 300);
  assert.equal(state().positioning.issue, 'closer');
  hold(person({ head: { yaw: 30 } }), 300);
  assert.equal(state().positioning.issue, 'frontal');
  hold(person(), 3000);
  assert.deepEqual([state().phase, state().positioning.ok], ['positioning', true], 'all right, but it waits for "Empezar"');
  vm.startCalibration();
  assert.equal(state().phase, 'calibrating');
  assert.deepEqual([state().calibration.stage, state().calibration.index, state().calibration.total], ['points', 0, 9]);
});

test('"Empezar igual" starts the points even if the position is not right', async () => {
  const { vm, hold, state } = setup({ pointer: 'eyes', calibrated: false });
  await vm.start();
  hold(person({ distance: 120 }), 300);
  vm.startCalibration();
  assert.equal(state().phase, 'calibrating');
});

// Follows the calibration's points, `delay` ms late; `lookAt(state)` can look somewhere else
function calibrate(env, lookAt = (st) => st.calibration.point) {
  const { hold, state } = env;
  for (let i = 0; i < 2000 && state().phase === 'calibrating'; i++) {
    const p = lookAt(state());
    hold(person({ look: p, noisePx: 0.3, lookNoise: 0.03, i }), 33);
  }
}

test('the calibration ends in a result to accept: only then is it kept (B7)', async () => {
  const env = setup({ pointer: 'eyes', calibrated: false });
  const { vm, state, settings } = env;
  await vm.start();
  vm.startCalibration();
  calibrate(env);
  assert.equal(state().phase, 'result');
  assert.ok(['good', 'fair'].includes(state().result.quality), state().result.quality);
  assert.equal(state().result.report.length, 4);
  assert.equal(settings.store.state.calibration, null, 'not kept yet');
  vm.acceptCalibration();
  assert.equal(state().phase, 'ready');
  assert.ok(settings.store.state.calibration, 'kept');
  assert.ok(state().errorPx < 80, `${state().errorPx} px`);
});

test('a test point looked at badly is marked; repeating the bad points measures only those again', async () => {
  const env = setup({ pointer: 'eyes', calibrated: false });
  const { vm, state } = env;
  await vm.start();
  vm.startCalibration();
  calibrate(env, (st) => (st.calibration.stage === 'test' && st.calibration.index === 1 ? { x: 0.1, y: 0.9 } : st.calibration.point));
  assert.equal(state().phase, 'result');
  assert.equal(state().result.hasBad, true);
  vm.repeatBadPoints();
  assert.equal(state().phase, 'calibrating');
  assert.equal(state().calibration.total, 1, 'only the bad one, then the test points');
  calibrate(env);
  assert.equal(state().phase, 'result');
});

test('a mirrored calibration is rejected: it cannot be accepted, only repeated', async () => {
  const env = setup({ pointer: 'eyes', calibrated: false });
  const { vm, state, settings } = env;
  await vm.start();
  vm.startCalibration();
  calibrate(env, (st) => ({ x: 1 - st.calibration.point.x, y: st.calibration.point.y }));
  assert.equal(state().result.rejected, 'inverted');
  vm.acceptCalibration();
  assert.equal(settings.store.state.calibration, null);
  vm.repeatCalibration();
  assert.equal(state().phase, 'positioning');
});

test('the precision report (B38, npm run dev): only after a calibration, and forgotten when it turns off', async () => {
  const env = setup({ pointer: 'eyes', calibrated: false });
  const { vm } = env;
  await vm.start();
  assert.equal(vm.report(), null, 'nothing measured yet');
  vm.startCalibration();
  calibrate(env);
  const text = vm.report({ screen: { width: 1440, height: 900 } });
  assert.match(text, /^platanus gaze report v1/);
  assert.match(text, /GPU/);
  vm.stop();
  assert.equal(vm.report(), null, 'turning it off forgets the numbers');
});

test('pointing with the head: holding still on a target selects it once, like a click (B11, B17, B19)', async () => {
  const { vm, hold, calls, state } = setup();
  await vm.start();
  hold(headAt(0, 0), 700);
  assert.deepEqual(calls.selected, []);
  assert.ok(state().ring > 0.5, `ring ${state().ring}`);
  hold(headAt(0, 0), 2000);
  assert.deepEqual(calls.selected, ['risks'], 'once, while it stays');
  assert.equal(state().selected, 'Riesgos');
  assert.equal(state().lens, null, 'no magnifier with the head');
});

test('the ring sits on the target, not on the point (B18)', async () => {
  const { vm, hold, state } = setup();
  await vm.start();
  hold(headAt(0, 0), 100);
  hold(headAt(-0.004, 0), 200); // a little to the side, still within the pull
  assert.ok(state().cursor.x > 0.5);
  assert.deepEqual(state().ringAt, { x: 0.5, y: 0.5 });
});

test('leaving before the ring completes selects nothing (B20)', async () => {
  const { vm, hold, calls } = setup();
  await vm.start();
  hold(headAt(0, 0), 500);
  hold(headAt(-0.05, -0.08), 2000); // away, where there is nothing
  assert.deepEqual(calls.selected, []);
});

test('with the eyes, holding still opens the magnifier there; inside it, holding still selects and closes it (B14, B15)', async () => {
  const { vm, hold, calls, state } = setup({ pointer: 'eyes' });
  await vm.start();
  hold(look(0.5, 0.5), 900);
  assert.equal(state().lens, null);
  hold(look(0.5, 0.5), 200);
  const lens = state().lens;
  assert.ok(lens, 'the magnifier opened');
  assert.equal(lens.factor, 4);
  assert.ok(lens.box.x < 0.5 && lens.box.x + lens.box.w > 0.5, 'around the gaze');
  assert.deepEqual(calls.selected, []);
  hold(look(0.5, 0.5), 1200);
  assert.deepEqual(calls.selected, ['risks']);
  assert.equal(state().lens, null, 'it closes after selecting');
  hold(look(0.5, 0.5), 2500);
  assert.equal(state().lens, null, 'it does not open again until the gaze moves');
});

test('the magnifier only opens where there is something to select (B14)', async () => {
  const { vm, hold, state } = setup({ pointer: 'eyes', targets: [] });
  await vm.start();
  hold(look(0.3, 0.3), 2500);
  assert.equal(state().lens, null);
});

test('looking out of the magnifier closes it without selecting (B16)', async () => {
  const { vm, hold, calls, state } = setup({ pointer: 'eyes' });
  await vm.start();
  hold(look(0.5, 0.5), 1100);
  assert.ok(state().lens);
  hold(look(0.95, 0.1), 300);
  assert.equal(state().lens, null);
  assert.deepEqual(calls.selected, []);
});

test('the big buttons of the bar are selected directly, without the magnifier (B24)', async () => {
  const { vm, hold, calls, state } = setup({ pointer: 'eyes' });
  await vm.start();
  hold(look(0.92, 0.91), 1200);
  assert.deepEqual(calls.selected, ['hf-pause']);
  assert.equal(state().lens, null);
});

test('a blink keeps the cursor where it was and does not restart the ring (B10)', async () => {
  const { vm, hold, state } = setup({ pointer: 'eyes' });
  await vm.start();
  hold(look(0.5, 0.5), 500);
  const before = state().cursor, ring = state().ring;
  hold(shut(0.1, 0.9), 130);
  assert.deepEqual(state().cursor, before);
  assert.ok(state().ring >= ring, 'the ring keeps going');
});

test('in pause nothing opens or is selected, except the button that resumes (B25)', async () => {
  const { vm, hold, calls, state } = setup({ pointer: 'eyes' });
  await vm.start();
  vm.togglePause();
  assert.equal(state().paused, true);
  hold(look(0.5, 0.5), 2500);
  assert.equal(state().lens, null);
  assert.deepEqual(calls.selected, []);
  hold(look(0.92, 0.91), 1600); // the smoothed cursor travels there first
  assert.deepEqual(calls.selected, ['hf-pause']);
});

test('what is marked never shows no ring and is never selected (B27)', async () => {
  const { vm, hold, calls, state } = setup({ targets: [NEVER] });
  await vm.start();
  hold(headAt(0, 0), 2500);
  assert.deepEqual(calls.selected, []);
  assert.equal(state().ring, 0);
});

test('the long blink is off by default: closing the eyes selects nothing (B21)', async () => {
  const { vm, hold, calls, settings } = setup();
  for (let i = 0; i < 10; i++) settings.step('headDwellMs', 1); // 3 s: the ring cannot be what selects
  await vm.start();
  hold(headAt(0, 0), 66);
  hold(() => closed({ nose: { x: 0.5, y: 0.55 } }), 1200);
  assert.deepEqual(calls.selected, []);
});

test('turning the long blink on measures it first; then a long blink selects before the ring ends (B22, B23)', async () => {
  const { vm, hold, send, now, calls, state, settings } = setup();
  await vm.start();
  vm.setLongBlink(true);
  assert.equal(state().phase, 'blinkSetup');
  for (let i = 0; i < 3; i++) {
    hold(headAt(0.2, 0.2), 200);
    hold(() => closed({ nose: { x: 0.7, y: 0.75 } }), 800);
  }
  hold(headAt(0.2, 0.2), 200);
  assert.equal(state().phase, 'ready');
  assert.equal(settings.store.state.longBlink, true);
  assert.equal(settings.store.state.blinkMs, 500);
  vm.center(); // recenter on the current head, so the target is under the cursor again
  hold(headAt(0, 0), 1500);
  calls.selected.length = 0;
  hold(headAt(0.2, 0.2), 300); // away
  hold(headAt(0, 0), 66); // back on the target
  hold(() => closed({ nose: { x: 0.5, y: 0.55 } }), 560);
  assert.deepEqual(calls.selected, ['risks'], 'selected by the blink, before the 800 ms ring');
  assert.ok(now.t > 0 && send);
});

test('a short blink with the long blink on does nothing', async () => {
  const { vm, hold, calls, settings } = setup();
  settings.saveBlink(500);
  settings.toggle('longBlink');
  for (let i = 0; i < 10; i++) settings.step('headDwellMs', 1);
  await vm.start();
  hold(headAt(0, 0), 100);
  hold(() => closed({ nose: { x: 0.5, y: 0.55 } }), 150);
  hold(headAt(0, 0), 100);
  assert.deepEqual(calls.selected, []);
});

test('"Corregir" with the eyes: looking at the center point removes a drift (B8)', async () => {
  const { vm, hold, state, settings } = setup({ pointer: 'eyes' });
  const model = settings.store.state.calibration;
  settings.saveCalibration({ ...model, ox: model.ox + 0.08, oy: model.oy - 0.05 }, 100); // as if it drifted
  await vm.start();
  vm.center();
  assert.equal(state().phase, 'centering');
  for (let i = 0; i < 200 && state().phase === 'centering'; i++) hold(look(0.5, 0.5), 33);
  assert.equal(state().phase, 'ready');
  hold(look(0.7, 0.3), 1500);
  assert.ok(Math.abs(state().cursor.x - 0.7) < 0.05 && Math.abs(state().cursor.y - 0.3) < 0.05, JSON.stringify(state().cursor));
});

test('a confirmed selection teaches a small correction (implicit recalibration)', async () => {
  const { vm, hold, calls, settings } = setup({ pointer: 'eyes' });
  await vm.start();
  assert.deepEqual(settings.store.state.calibration.ax, [1, 0, 0]);
  hold(look(0.5, 0.5), 2400);
  assert.deepEqual(calls.selected, ['risks']);
  assert.notDeepEqual(settings.store.state.calibration.ax, [1, 0, 0], 'the correction moved');
});

test('"Recentrar" with the head: the current position becomes the center (B12)', async () => {
  const { vm, hold, state } = setup();
  await vm.start();
  hold(headAt(0, 0), 100);
  vm.center();
  for (let i = 0; i < 200 && state().phase === 'centering'; i++) hold(headAt(-0.04, 0.02), 33);
  assert.equal(state().phase, 'ready');
  hold(headAt(-0.04, 0.02), 300);
  assert.ok(Math.abs(state().cursor.x - 0.5) < 0.01 && Math.abs(state().cursor.y - 0.5) < 0.01, JSON.stringify(state().cursor));
});

test('without a face: no cursor, no ring, no magnifier, and it says so (B13)', async () => {
  const { vm, hold, send, state } = setup({ pointer: 'eyes' });
  await vm.start();
  hold(look(0.5, 0.5), 1100);
  assert.ok(state().lens);
  send(null);
  assert.deepEqual([state().face, state().cursor, state().ring, state().lens], [false, null, 0, null]);
});

test('an adjustment is used from the next ring: a longer hold-still time (B26)', async () => {
  const { vm, hold, calls, state } = setup();
  await vm.start();
  vm.openSettings();
  assert.equal(state().settingsKey, 'pointer');
  vm.settingsMove(1);
  assert.equal(state().settingsKey, 'dwell');
  vm.settingsStep(1);
  vm.settingsStep(1);
  vm.closeSettings();
  hold(headAt(0, 0), 1100);
  assert.deepEqual(calls.selected, [], 'not at 800 ms any more');
  hold(headAt(0, 0), 400);
  assert.deepEqual(calls.selected, ['risks']);
});

test('switching to the eyes without a calibration starts it (the position first)', async () => {
  const { vm, state } = setup();
  await vm.start();
  vm.openSettings();
  vm.settingsStep(1); // pointer: head -> eyes
  assert.equal(state().pointer, 'eyes');
  assert.equal(state().phase, 'positioning');
  assert.equal(state().settingsOpen, false);
});

test('slow analysis is told (B31)', async () => {
  const { vm, hold, state } = setup();
  await vm.start();
  hold(headAt(0, 0), 3500, 100);
  assert.equal(state().slow, true);
});

test('closing the project closes the magnifier and keeps it on; turning it off hides everything (B33, B34)', async () => {
  const { vm, hold, state, tracking } = setup({ pointer: 'eyes' });
  await vm.start();
  hold(look(0.5, 0.5), 1100);
  assert.ok(state().lens);
  vm.projectClosed();
  assert.equal(state().lens, null);
  assert.equal(state().status, 'on');
  vm.stop();
  assert.deepEqual([state().status, state().cursor, state().lens, state().ring], ['off', null, null, 0]);
  assert.equal(tracking.stopped, 1);
});

test('with little light the card says so, while checking the position and while pointing (B37)', async () => {
  const { vm, send, now, state } = setup({ pointer: 'eyes', calibrated: false });
  await vm.start();
  for (let i = 0; i < 5; i++) { now.t += 33; send(person(), { light: 0.08 }); }
  assert.equal(state().positioning.issue, 'light');
  for (let i = 0; i < 5; i++) { now.t += 33; send(person(), { light: 0.5 }); }
  assert.equal(state().positioning.ok, true);
  const pointing = setup({ pointer: 'eyes' });
  await pointing.vm.start();
  pointing.now.t += 33;
  pointing.send(look(0.5, 0.5), { light: 0.08 });
  assert.equal(pointing.state().dark, true);
  pointing.now.t += 33;
  pointing.send(look(0.5, 0.5), { light: 0.6 });
  assert.equal(pointing.state().dark, false);
});

