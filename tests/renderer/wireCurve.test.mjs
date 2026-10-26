import test from 'node:test';
import assert from 'node:assert/strict';
import { wireCurve, wireLength, pointAlong, spreadStep, partAngle, localToBench, ARC } from '../../renderer/views/scene/lab/wireCurve.js';
import { pinSpots } from '../../renderer/viewmodels/labLayout.js';

const A = { x: -2, y: 0.42, z: 1 };
const B = { x: 3, y: 0.3, z: -1.5 };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('wireCurve: the ends are exactly the two pins', () => {
  const pts = wireCurve(A, B);
  assert.deepEqual(pts[0], A);
  assert.deepEqual(pts.at(-1), B);
  assert.equal(pts.length, ARC.segments + 1);
});

test('wireCurve: the middle rises above both ends', () => {
  const pts = wireCurve(A, B);
  const apex = Math.max(...pts.map((p) => p.y));
  assert.ok(apex > A.y + 0.2 && apex > B.y + 0.2);
  const mid = pts[Math.floor(pts.length / 2)];
  assert.ok(mid.y > Math.max(A.y, B.y));
});

test('wireCurve: a longer wire arcs higher, up to a cap', () => {
  const apex = (b) => Math.max(...wireCurve({ x: 0, y: 0.4, z: 0 }, b).map((p) => p.y));
  assert.ok(apex({ x: 6, y: 0.4, z: 0 }) > apex({ x: 1, y: 0.4, z: 0 }));
  assert.ok(apex({ x: 200, y: 0.4, z: 0 }) <= 0.4 + ARC.max + 1e-9);
});

test('wireCurve: deterministic', () => {
  assert.deepEqual(wireCurve(A, B, { index: 3 }), wireCurve(A, B, { index: 3 }));
});

test('wireCurve: parallel wires shift sideways by index, ends stay put', () => {
  const a = { x: 0, y: 0.4, z: 0 }, b = { x: 4, y: 0.4, z: 0 };
  const mid = (index) => wireCurve(a, b, { index })[ARC.segments / 2];
  assert.ok(close(mid(0).z, 0));
  assert.ok(mid(1).z > 0.05);
  assert.ok(mid(2).z < -0.05);
  assert.ok(Math.abs(mid(3).z) > Math.abs(mid(1).z));
  assert.deepEqual(wireCurve(a, b, { index: 2 })[0], a);
  assert.deepEqual(wireCurve(a, b, { index: 2 }).at(-1), b);
  assert.deepEqual([0, 1, 2, 3, 4].map(spreadStep), [0, 1, -1, 2, -2]);
});

test('wireCurve: two pins one above the other still give a finite arc', () => {
  const pts = wireCurve({ x: 1, y: 0.2, z: 1 }, { x: 1, y: 0.5, z: 1 });
  assert.ok(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)));
});

test('pointAlong: ends, middle and wrap-around', () => {
  const line = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }];
  assert.equal(wireLength(line), 3);
  assert.deepEqual(pointAlong(line, 0), { x: 0, y: 0, z: 0 });
  assert.deepEqual(pointAlong(line, 1), { x: 3, y: 0, z: 0 });
  assert.ok(close(pointAlong(line, 0.5).x, 1.5));
  assert.ok(close(pointAlong(line, 1.25).x, 0.75));
  assert.ok(close(pointAlong(line, -0.25).x, 2.25));
});

test('partAngle + localToBench place a part pin where labLayout says it is (every turn)', () => {
  for (const type of ['arduino-uno', 'hc-sr04', 'servo-sg90']) {
    const local = pinSpots({ type, x: 0, z: 0, rot: 0 });
    for (let rot = 0; rot < 4; rot++) {
      const part = { type, x: 2.5, z: -1.5, rot };
      const world = pinSpots(part);
      world.forEach((w, i) => {
        const p = localToBench(local[i], part);
        assert.ok(close(p.x, w.x, 1e-6) && close(p.z, w.z, 1e-6) && close(p.y, w.y, 1e-6), `${type} rot ${rot} ${w.pin}`);
      });
    }
  }
  assert.ok(close(partAngle(1), -Math.PI / 2));
});
