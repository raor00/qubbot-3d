// The math of the hands-free control (spec/004-hands-free-control.md) as pure numbers: no camera, no DOM.
// The head pointer, taking a still point, the long blink, the magnifier and the pull toward the nearest
// target. The gaze has its own tests (gazeModel.test.mjs).
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PointSampler, HeadPointer, BlinkTracker, longBlinkThreshold, LONG_BLINK_MIN_MS, lensGeometry, lensSize, nearestTarget, inside,
} from '../../renderer/models/faceGesture.js';
import { DwellTimer } from '../../renderer/models/handGesture.js';
import { face, closed, headAt, jitter, VIEWPORT } from './faceFixtures.mjs';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('a point is taken once the gaze stays still on it; while it moves it waits (B6)', () => {
  const s = new PointSampler();
  let t = 0, last;
  for (let i = 0; i < 40; i++, t += 33) last = s.update({ x: 0.5 + (i % 2 ? 0.05 : -0.05), y: 0.5 }, t);
  assert.equal(last.done, null, 'a gaze that jumps is not still');
  const still = new PointSampler();
  t = 0;
  for (let i = 0; i < 60 && !last?.done; i++, t += 33) last = still.update({ x: 0.5 + jitter(i, 0.001), y: 0.5 }, t);
  assert.ok(last.done, 'taken');
  assert.ok(Math.abs(last.done.x - 0.5) < 0.002);
  assert.ok(new PointSampler().update(null, 0).progress === 0, 'closed eyes do not count');
});

test('the head pointer starts at the center and moves with the head, with its own gain for each direction (B11)', () => {
  const head = new HeadPointer({ gains: { left: 2, right: 8, up: 4, down: 4 }, smoothing: 0 });
  assert.deepEqual(head.update(headAt(0, 0)), { x: 0.5, y: 0.5 }, 'the first frame is the rest position');
  const right = head.update(headAt(-0.02, 0)); // the person's right: the image's left
  assert.ok(right.x > 0.6, `right ${right.x}`);
  const left = new HeadPointer({ gains: { left: 2, right: 8, up: 4, down: 4 }, smoothing: 0 });
  left.update(headAt(0, 0));
  const l = left.update(headAt(0.02, 0));
  assert.ok(0.5 - l.x < right.x - 0.5, 'a smaller gain to the left moves less');
  const down = head.update(headAt(0, 0.03));
  assert.ok(down.y > 0.5);
  assert.equal(head.update(null), null);
});

test('"Recentrar" takes the current head position as the center of the window (B12)', () => {
  const head = new HeadPointer({ smoothing: 0 });
  head.update(headAt(0, 0));
  head.recenter(headAt(-0.04, 0.02));
  const p = head.update(headAt(-0.04, 0.02));
  assert.ok(dist(p, { x: 0.5, y: 0.5 }) < 1e-9, JSON.stringify(p));
});

test('a long blink fires once past its threshold; a normal blink does nothing (B21-B23)', () => {
  const b = new BlinkTracker({ thresholdMs: 500 });
  let t = 0;
  const run = (eyes, ms) => { const out = []; for (let e = 0; e <= ms; e += 33, t += 33) out.push(b.update(eyes, t)); return out; };
  run(face(), 100);
  const quick = run(closed(), 150);
  assert.ok(quick.every((r) => !r.long), 'a spontaneous blink');
  const opened = run(face(), 66);
  assert.ok(opened.some((r) => r.ended >= 150), 'it reports how long it lasted');
  const long = run(closed(), 800);
  assert.equal(long.filter((r) => r.long).length, 1, 'once per closing');
  run(face(), 66);
  const wink = run(face({ blink: { left: 0.9 } }), 700);
  assert.equal(wink.filter((r) => r.long).length, 1, 'one eye is enough (palsy on one side)');
  const off = new BlinkTracker({ thresholdMs: null });
  t = 0;
  for (let e = 0; e < 1500; e += 33, t += 33) assert.equal(off.update(closed(), t).long, false, 'off by default');
});

test('the long-blink threshold sits above spontaneous blinks', () => {
  assert.equal(longBlinkThreshold([700, 800, 900]), LONG_BLINK_MIN_MS);
  assert.equal(longBlinkThreshold([1500, 1600, 1700]), 960);
  assert.ok(LONG_BLINK_MIN_MS > 400, 'spontaneous blinks last up to ~400 ms');
});

test('the magnifier is a box around the gaze; near an edge the box stays inside and still shows that point (B14)', () => {
  const vp = VIEWPORT;
  const g = { x: 500, y: 400 };
  const middle = lensGeometry(g, { factor: 4, size: 400 }, vp);
  assert.deepEqual(middle.box, { x: 300, y: 200, w: 400, h: 400 });
  assert.deepEqual(middle.origin, g);
  assert.deepEqual(middle.source, { x: 450, y: 350, w: 100, h: 100 });
  const corner = lensGeometry({ x: 40, y: 760 }, { factor: 4, size: 400 }, vp);
  assert.ok(corner.box.x >= 0 && corner.box.y + corner.box.h <= vp.height, 'inside the window');
  const c = { x: corner.box.x + corner.box.w / 2, y: corner.box.y + corner.box.h / 2 };
  const shown = { x: corner.origin.x + 4 * (40 - corner.origin.x), y: corner.origin.y + 4 * (760 - corner.origin.y) };
  assert.ok(dist(shown, c) < 1e-6, 'the gazed point appears at the center of the box');
  assert.ok(inside(corner.box, c) && !inside(corner.box, { x: 900, y: 100 }));
});

test('the magnifier is at least three times the measured error, within the window', () => {
  assert.equal(lensSize(150, VIEWPORT), 450);
  assert.equal(lensSize(null, VIEWPORT), 360);
  assert.equal(lensSize(400, VIEWPORT), 640, 'never more than 80% of the window');
});

test('the pull goes to the nearest selectable target within the radius (B18)', () => {
  const a = { key: 'a', rect: { x: 100, y: 100, w: 40, h: 40 } };
  const b = { key: 'b', rect: { x: 200, y: 100, w: 40, h: 40 } };
  assert.equal(nearestTarget({ x: 150, y: 120 }, [a, b], 30)?.key, 'a');
  assert.equal(nearestTarget({ x: 190, y: 120 }, [a, b], 30)?.key, 'b');
  assert.equal(nearestTarget({ x: 120, y: 120 }, [a, b], 30)?.key, 'a', 'inside: distance 0');
  assert.equal(nearestTarget({ x: 170, y: 300 }, [a, b], 30), null, 'too far');
});

test('the hold-still timer takes its time and tolerance from the settings (B26)', () => {
  const d = new DwellTimer({ ms: 1000, tolerance: 0.05 });
  d.update('k', { x: 0.5, y: 0.5 }, 0);
  assert.equal(d.update('k', { x: 0.54, y: 0.5 }, 800).fire, false, 'within the tolerance it keeps counting');
  assert.equal(d.update('k', { x: 0.54, y: 0.5 }, 1000).fire, true);
  d.configure({ ms: 2000 });
  d.reset();
  d.update('j', { x: 0.5, y: 0.5 }, 0);
  assert.equal(d.update('j', { x: 0.5, y: 0.5 }, 1500).fire, false);
  assert.equal(d.update('j', { x: 0.5, y: 0.5 }, 2000).fire, true);
});
