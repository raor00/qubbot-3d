// The precision report (spec/004-hands-free-control.md, B38): what a calibration measured, in numbers only, so a
// real camera's problems can be told apart (mirror, head, vertical axis, speed, late saccades, filter). It is
// built from what the calibration kept in memory and leaves only as text the person copies (npm run dev).
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GazeCalibration, CALIBRATION_POINTS, TEST_POINTS } from '../../renderer/models/gazeModel.js';
import { analyzeCalibration, formatReport, screenScale } from '../../renderer/models/gazeReport.js';
import { runCalibration } from './faceFixtures.mjs';

const VP = { width: 1000, height: 650 };
const ENV = { screen: { width: 1440, height: 900 }, filter: { minCutoff: 0.31 }, holdRadius: 0.042 };
let cached = null;
const calibrated = () => (cached ??= runCalibration(new GazeCalibration({ viewport: VP })).done);
let analysed = null;
const analysis = () => (analysed ??= analyzeCalibration(calibrated().diagnostics, ENV));
const byName = (list) => Object.fromEntries(list.map((x) => [x.name, x]));

test('the calibration keeps in memory what each point collected, and when', () => {
  const d = calibrated().diagnostics;
  assert.equal(d.items.length, CALIBRATION_POINTS.length + 1 + TEST_POINTS.length, '9 points, the head step, 4 tests');
  for (const item of d.items) {
    assert.ok(item.vectors.length >= 8, `${item.stage}: ${item.vectors.length} kept`);
    assert.ok(item.trace.length > item.vectors.length, 'the trace has the wait too');
    assert.ok(item.trace.every((f, i) => i === 0 || f.dt >= item.trace[i - 1].dt));
  }
  assert.ok(d.fit?.model);
  assert.equal(d.settleMs, 900);
});

test('px to degrees: a 13.3" 16:10 screen is ~28.6 cm wide; 100 px at 60 cm is ~1.9°', () => {
  const s = screenScale({ screen: { width: 1440, height: 900 } });
  assert.ok(Math.abs(s.widthCm - 28.65) < 0.1, `${s.widthCm} cm`);
  assert.ok(Math.abs(s.toDeg(100) - 1.9) < 0.05, `${s.toDeg(100)}°`);
  assert.ok(Math.abs(s.pxPerDeg - 52.6) < 1, `${s.pxPerDeg} px per degree`);
});

test('each feature: how much it moves between points against how much it trembles, and its sign in the raw image', () => {
  const f = byName(analysis().features);
  assert.ok(f.lookX.corrX > 0.9, 'MediaPipe\'s guess: the person\'s right is positive');
  assert.ok(f.irisX.corrX < -0.9, 'the raw image: looking right moves the iris to the image\'s left');
  assert.ok(f.lookY.corrY < -0.9, 'lookY is up-positive, the window\'s y goes down');
  assert.ok(f.irisX.snr > 3, `irisX snr ${f.irisX.snr}`);
  assert.ok(Number.isFinite(f.irisX.range) && Number.isFinite(f.irisX.within));
});

test('a mirrored calibration is rejected but still leaves its numbers to look at', () => {
  const done = runCalibration(new GazeCalibration({ viewport: VP }), { mirror: true }).done;
  assert.equal(done.rejected, 'inverted');
  const a = analyzeCalibration(done.diagnostics, ENV);
  assert.ok(byName(a.features).lookX.corrX < -0.9, 'MediaPipe\'s guess goes against the points');
  assert.equal(a.rejected, 'inverted');
});

test('leaving one point out, per axis and per group of features', () => {
  const a = analysis();
  assert.ok(Number.isFinite(a.fit.loo.median) && Number.isFinite(a.fit.loo.x) && Number.isFinite(a.fit.loo.y));
  assert.equal(a.fit.candidates.length, 8, '2 kinds × 4 lambdas');
  const by = byName(a.subsets);
  for (const name of ['all', 'eyes', 'look', 'eyesLook', 'eyesHead', 'lookHead']) assert.ok(by[name], name);
  assert.ok(by.all.median <= by.look.median * 1.05, `all ${by.all.median} vs look ${by.look.median}`);
  assert.equal(a.fit.coefficients.length, 10, 'one per feature, px per standard deviation');
});

test('arrival: right after a point appears the eyes are still elsewhere; by the end of the wait they are there', () => {
  const a = analysis();
  const first = a.arrival[0], settled = a.arrival.find((b) => b.from === 750);
  assert.ok(first.median > 100, `0-150 ms: ${first.median} px`);
  assert.ok(settled.median < first.median / 3, `750-900 ms: ${settled.median} px`);
  // The wait (900 ms) outlasts the late saccade (450 ms): within a point the gaze only trembles, it does not slide
  const drifts = a.items.filter((i) => i.stage === 'points').map((p) => p.drift);
  assert.ok(drifts.reduce((s, d) => s + d, 0) / drifts.length < 60, `drifts ${drifts.map(Math.round)} px`);
});

test('the test points: error in px and degrees, per axis, and what the filter does with the tremor', () => {
  const a = analysis();
  assert.equal(a.tests.length, 4);
  for (const t of a.tests) {
    assert.ok(Math.abs(t.errorDeg - a.scale.toDeg(t.errorPx)) < 1e-9);
    assert.ok(t.filteredSd < t.rawSd, `raw ${t.rawSd} -> filtered ${t.filteredSd}`);
    assert.ok(t.held >= 0 && t.held <= 1);
  }
  assert.ok(Number.isFinite(a.summary.medianPx) && Number.isFinite(a.summary.dx) && Number.isFinite(a.summary.dy));
});

test('the text: numbers only, a summary and not the frames, nothing of the face itself', () => {
  const text = formatReport(analysis());
  assert.match(text, /^platanus gaze report v1/);
  for (const part of ['env:', 'result:', 'fit:', 'by features', 'features:', 'points:', 'arrival', 'tests:']) assert.ok(text.includes(part), part);
  assert.ok(!/eyeLook|eyeBlink|landmark|matrix/i.test(text), 'no blendshapes, no face points');
  assert.ok(text.split('\n').length < 90, `${text.split('\n').length} lines`);
});

test('a calibration that could not fit (no face at all) still gives a report', () => {
  const session = new GazeCalibration({ viewport: VP });
  let state = null;
  for (let t = 0; t < 120000 && !state?.done; t += 33) state = session.update(null, t);
  assert.equal(state.done.rejected, 'fit');
  const text = formatReport(analyzeCalibration(state.done.diagnostics, ENV));
  assert.match(text, /rejected fit/);
});
