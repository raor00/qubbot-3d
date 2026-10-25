// The gaze calibration, v2 (spec/004-hands-free-control.md): realistic faces (tests/renderer/faceFixtures.mjs:
// a 13" laptop at 60 cm, MediaPipe's tremor, a late saccade, a head that moves), every frame of a fixation,
// outliers dropped, ridge regression chosen by leaving one point out, the head's pose in the model, a check
// against MediaPipe's own gaze guess, a filter that keeps the cursor still while the eyes fixate, and the
// corrections learned from each confirmed selection.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_COUNT, gazeVector, headPose, lookOf, GazeCalibration, fitGazeModel, predict, correctModel, fitAffine, withAffine,
  OneEuro, FixationHold, quality, positionCheck, CALIBRATION_POINTS, TEST_POINTS,
} from '../../renderer/models/gazeModel.js';
import { person, runCalibration, noise } from './faceFixtures.mjs';

const VP = { width: 1000, height: 650 };
const errPx = (p, t) => Math.hypot((p.x - t.x) * VP.width, (p.y - t.y) * VP.height);
// The mean prediction of a few noisy frames (what the cursor settles on)
const settle = (model, opts, frames = 20) => {
  const ps = Array.from({ length: frames }, (_, i) => predict(model, gazeVector(person({ noisePx: 0.8, lookNoise: 0.08, ...opts, i: 5000 + i }))));
  return { x: ps.reduce((s, p) => s + p.x, 0) / frames, y: ps.reduce((s, p) => s + p.y, 0) / frames };
};
const meanError = (model, looks, head = {}) => looks.reduce((s, look) => s + errPx(settle(model, { look, head }), look), 0) / looks.length;

// Column-major 4×4 helpers for the pose
const matrix = (R, t = [0, 0, 0]) => [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1];
const rad = (d) => (d * Math.PI) / 180;
const Ry = (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const Rx = (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('the head pose comes from MediaPipe\'s matrix; its own gaze guess has the person\'s right and up positive', () => {
  assert.ok(close(headPose(matrix(Ry(10))).yaw, 10));
  assert.ok(close(headPose(matrix(Rx(-7))).pitch, -7));
  assert.deepEqual(headPose(matrix(Ry(0), [1, -2, -40])).tx, 1);
  assert.equal(headPose(null), null);
  assert.ok(lookOf({ eyeLookInLeft: 0.6, eyeLookOutRight: 0.6 }).x > 0);
  assert.ok(lookOf({ eyeLookUpLeft: 0.5, eyeLookUpRight: 0.5 }).y > 0);
});

test('one vector per frame: the irises, the lids, MediaPipe\'s guess and the head; none with both eyes closed', () => {
  const v = gazeVector(person({ look: { x: 0.8, y: 0.3 } }));
  assert.equal(v.length, FEATURE_COUNT);
  assert.ok(v.every(Number.isFinite));
  assert.equal(gazeVector(person({ blink: { left: 0.9, right: 0.9 } })), null);
  assert.equal(gazeVector(null), null);
  const one = gazeVector(person({ look: { x: 0.8, y: 0.3 }, blink: { right: 0.9 } }));
  assert.ok(one && Math.abs(one[0] - v[0]) < 0.01, 'one open eye is enough (a palsy on one side)');
});

test('a calibration with a realistic person takes under 45 s and lands within a few dozen pixels (B6, B7)', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP }));
  assert.ok(done.done, 'finished');
  assert.equal(done.done.rejected, null);
  assert.ok(done.ms <= 45000, `${done.ms} ms`);
  assert.ok(done.done.errorPx < 60, `test points: ${done.done.errorPx} px`);
  assert.equal(done.done.report.length, TEST_POINTS.length);
  assert.ok(['good', 'fair'].includes(done.done.quality));
});

test('a late saccade does not mix samples of the previous point into the next one', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP }), { delay: 650 }).done;
  assert.ok(done.errorPx < 60, `${done.errorPx} px`);
  for (const p of CALIBRATION_POINTS) {
    const mine = done.samples.filter((s) => s.target === p);
    assert.ok(mine.length >= 8, 'enough frames per point');
    const expected = gazeVector(person({ look: p }))[0];
    const mean = mine.reduce((s, x) => s + x.v[0], 0) / mine.length;
    assert.ok(Math.abs(mean - expected) < 0.02, `point ${JSON.stringify(p)}: ${mean} vs ${expected}`);
  }
});

test('outlier frames are dropped and do not move the fit', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP }), { wild: (i) => i % 7 === 3 }).done;
  assert.ok(done.errorPx < 70, `${done.errorPx} px`);
  for (const p of CALIBRATION_POINTS) {
    const xs = done.samples.filter((s) => s.target === p).map((s) => s.v[0]).sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)];
    assert.ok(xs.every((x) => Math.abs(x - median) < 0.15), 'no wild iris kept');
  }
});

test('the model is chosen by leaving one point out: the chosen one has the lowest error of all candidates', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP })).done;
  const fit = fitGazeModel(done.samples);
  assert.ok(fit.model);
  const best = Math.min(...fit.candidates.map((c) => c.error));
  assert.equal(fit.cv.error, best);
  assert.ok(fit.candidates.length >= 4);
  assert.ok(Object.values(fit.model).flat().every((v) => typeof v === 'number' && Number.isFinite(v)), 'only numbers');
});

test('a calibration that comes out mirrored (against MediaPipe\'s own guess) is rejected and says so', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP }), { mirror: true }).done;
  assert.equal(done.rejected, 'inverted');
  assert.equal(done.quality, 'bad');
});

test('with the head in the model, a turned and moved head still lands close; without it, much farther', () => {
  const wiggle = (t, state) => (state?.stage === 'head' ? { yaw: 9 * Math.sin(t / 240), x: 2 * Math.cos(t / 310), pitch: 4 * Math.sin(t / 410) } : {});
  const withHead = runCalibration(new GazeCalibration({ viewport: VP }), { head: wiggle }).done;
  const without = runCalibration(new GazeCalibration({ viewport: VP, headStep: false })).done;
  const looks = [{ x: 0.72, y: 0.28 }, { x: 0.28, y: 0.72 }, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.8 }];
  const head = { yaw: 7, x: 1.5 };
  const a = meanError(withHead.model, looks, head), b = meanError(without.model, looks, head);
  assert.ok(a < 90, `with the head: ${a} px`);
  assert.ok(a < b * 0.6, `with ${a} px vs without ${b} px`);
});

test('the One Euro filter calms a trembling gaze but follows a jump quickly', () => {
  const f = new OneEuro({ minCutoff: 0.5, beta: 1.5 });
  const out = [];
  for (let i = 0; i < 90; i++) out.push(f.update({ x: 0.5 + 0.03 * noise(i, 1), y: 0.5 + 0.03 * noise(i, 2) }, i * 33));
  const sd = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };
  assert.ok(sd(out.slice(30).map((p) => p.x)) < 0.012, 'calmer than the input (0.03)');
  let p;
  for (let i = 90; i < 100; i++) p = f.update({ x: 0.85, y: 0.5 }, i * 33);
  assert.ok(p.x > 0.78, `follows the jump: ${p.x}`);
});

test('while the eyes fixate, the cursor stays exactly still; a real move frees it', () => {
  const hold = new FixationHold({ windowMs: 150, radius: 0.02 });
  const out = [];
  for (let i = 0; i < 30; i++) out.push(hold.update({ x: 0.5 + 0.004 * noise(i, 3), y: 0.5 + 0.004 * noise(i, 4) }, i * 33));
  const tail = out.slice(10);
  assert.ok(tail.every((p) => p.x === tail[0].x && p.y === tail[0].y), 'locked');
  const moved = hold.update({ x: 0.7, y: 0.5 }, 31 * 33);
  assert.equal(moved.x, 0.7);
});

test('each confirmed selection teaches a correction: a drifted calibration comes back (implicit recalibration)', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP })).done;
  const drifted = { ...done.model, ox: done.model.ox + 0.1, oy: done.model.oy - 0.07 };
  const looks = [{ x: 0.2, y: 0.25 }, { x: 0.8, y: 0.3 }, { x: 0.5, y: 0.75 }, { x: 0.3, y: 0.6 }, { x: 0.7, y: 0.8 }];
  const before = meanError(drifted, TEST_POINTS);
  const pairs = looks.map((look) => ({ predicted: settle({ ...drifted, ax: null, ay: null }, { look }), target: look, weight: 1 }));
  const fixed = withAffine(drifted, fitAffine(pairs));
  const after = meanError(fixed, TEST_POINTS);
  assert.ok(before > 60, `drifted: ${before} px`);
  assert.ok(after < before / 2, `after ${after} px`);
});

test('"Corregir" shifts the whole fit so the center lands on the center (B8)', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP })).done;
  const drifted = { ...done.model, ox: done.model.ox - 0.07 };
  const v = gazeVector(person({ look: { x: 0.5, y: 0.5 } }));
  const fixed = correctModel(drifted, v, { x: 0.5, y: 0.5 });
  assert.ok(errPx(predict(fixed, v), { x: 0.5, y: 0.5 }) < 2);
});

test('quality in words, and the test points that went badly are marked', () => {
  assert.equal(quality(60, VP), 'good');
  assert.equal(quality(110, VP), 'fair');
  assert.equal(quality(300, VP), 'bad');
  const done = runCalibration(new GazeCalibration({ viewport: VP })).done;
  assert.ok(done.report.every((r) => typeof r.bad === 'boolean' && Number.isFinite(r.errorPx)));
});

test('repeating only the bad points adds them to what was learned and measures again', () => {
  const first = runCalibration(new GazeCalibration({ viewport: VP })).done;
  const again = runCalibration(new GazeCalibration({ viewport: VP, base: first.samples, points: [TEST_POINTS[1]] })).done;
  assert.ok(again.samples.length > first.samples.length, 'kept what it had');
  assert.equal(again.report.length, TEST_POINTS.length, 'measured again');
  assert.ok(again.errorPx < 60, `${again.errorPx} px`);
});

test('a slower pace takes longer on each point', () => {
  const normal = runCalibration(new GazeCalibration({ viewport: VP }));
  const slow = runCalibration(new GazeCalibration({ viewport: VP, pace: 2 }));
  assert.ok(slow.ms > normal.ms * 1.6, `${slow.ms} vs ${normal.ms}`);
});

test('before calibrating, the position is checked: centered, at a good distance, facing the screen, eyes open', () => {
  assert.deepEqual(positionCheck(person()), { ok: true, issue: null });
  assert.equal(positionCheck(person({ distance: 120 })).issue, 'closer');
  assert.equal(positionCheck(person({ distance: 25 })).issue, 'farther');
  assert.equal(positionCheck(person({ head: { x: 20 } })).issue, 'center');
  assert.equal(positionCheck(person({ head: { yaw: 30 } })).issue, 'frontal');
  assert.equal(positionCheck(person({ blink: { left: 0.6, right: 0.6 } })).issue, 'eyes');
  assert.equal(positionCheck(null).issue, 'noFace');
});

// What a selection may teach (2026-10-25): learning from every selection could bend the whole screen toward
// one corner (all of them in the dock) or toward a wrong target. Only plausible selections count; until they
// cover at least 3 regions of the screen, only a shift is learned, never a stretch.
test('the implicit correction is only a shift until selections cover the screen; implausible ones are ignored', async () => {
  const { implicitCorrection } = await import('../../renderer/models/gazeModel.js');
  const pair = (px, py, tx, ty) => ({ predicted: { x: px, y: py }, target: { x: tx, y: ty }, weight: 1 });
  const one = implicitCorrection([pair(0.1, 0.5, 0.15, 0.5)], { viewport: VP, errorPx: 60 });
  assert.equal(one.ax[0], 1);
  assert.equal(one.ax[1], 0);
  assert.ok(one.ax[2] > 0 && one.ax[2] < 0.05, 'a shrunk shift toward the target');
  const dock = [0.2, 0.4, 0.6, 0.8].map((y) => pair(0.05, y, 0.08, y));
  const sameRegion = implicitCorrection(dock, { viewport: VP, errorPx: 60 });
  assert.equal(sameRegion.ax[0], 1, 'all in the dock: no stretch');
  const spread = [pair(0.1, 0.1, 0.13, 0.1), pair(0.9, 0.1, 0.95, 0.1), pair(0.5, 0.5, 0.52, 0.5), pair(0.1, 0.9, 0.12, 0.9), pair(0.9, 0.9, 0.96, 0.9)];
  const full = implicitCorrection(spread, { viewport: VP, errorPx: 60 });
  assert.notEqual(full.ax[0], 1, 'across the screen: a full correction');
  const wild = implicitCorrection([pair(0.1, 0.1, 0.9, 0.9)], { viewport: VP, errorPx: 60 });
  assert.deepEqual([wild.ax, wild.ay], [[1, 0, 0], [0, 1, 0]], 'a selection far from where the gaze was teaches nothing');
});
