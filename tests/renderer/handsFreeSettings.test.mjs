// What the hands-free control remembers on this computer (spec/004-hands-free-control.md): the opt-in, how
// the person points and their adjustments. Only numbers, never anything from the face (B28). And what each
// camera frame passes to the logic (B29).
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandsFreeSettings, sanitize, STORAGE_KEY, DEFAULTS } from '../../renderer/models/handsFreeSettings.js';
import { FEATURE_COUNT } from '../../renderer/models/gazeModel.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    raw: () => map.get(STORAGE_KEY),
  };
}

// A calibration as the gaze model saves it: numbers only
const MODEL = {
  v: 2, kind: 0,
  mean: Array.from({ length: FEATURE_COUNT }, () => 0.1), std: Array.from({ length: FEATURE_COUNT }, () => 1),
  cx: Array.from({ length: FEATURE_COUNT + 1 }, (_, i) => i / 10), cy: Array.from({ length: FEATURE_COUNT + 1 }, () => 0.2),
  ox: 0, oy: 0, ax: [1, 0, 0], ay: [0, 1, 0],
};

test('nobody opted in: the control is off and nothing is stored (B1)', () => {
  const storage = memoryStorage();
  const s = new HandsFreeSettings({ storage });
  assert.equal(s.store.state.optIn, false);
  assert.equal(storage.raw(), undefined);
});

test('opting in remembers it and how the person points, with the starting hold-still times (B2, D2)', () => {
  const storage = memoryStorage();
  new HandsFreeSettings({ storage }).optIn('eyes');
  const again = new HandsFreeSettings({ storage });
  assert.equal(again.store.state.optIn, true);
  assert.equal(again.store.state.pointer, 'eyes');
  assert.equal(again.dwellFor('eyes'), 1000);
  assert.equal(again.dwellFor('head'), 800);
  assert.equal(again.store.state.pace, 1);
});

test('turning it off forgets everything, calibration included (B4)', () => {
  const storage = memoryStorage();
  const s = new HandsFreeSettings({ storage });
  s.optIn('head');
  s.saveCalibration(MODEL, 120);
  s.optOut();
  assert.equal(storage.raw(), undefined);
  assert.equal(s.store.state.optIn, false);
  assert.equal(s.store.state.calibration, null);
});

test('each adjustment moves in steps and stays within its range (B26)', () => {
  const s = new HandsFreeSettings({ storage: memoryStorage() });
  s.optIn('eyes');
  for (let i = 0; i < 20; i++) s.step('eyesDwellMs', 1);
  assert.equal(s.store.state.eyesDwellMs, 3000);
  for (let i = 0; i < 20; i++) s.step('eyesDwellMs', -1);
  assert.equal(s.store.state.eyesDwellMs, 500);
  s.step('lensFactor', 1);
  assert.equal(s.store.state.lensFactor, DEFAULTS.lensFactor + 0.5);
  s.step('pace', 1);
  assert.equal(s.store.state.pace, 1.5, 'a slower calibration');
  s.toggle('longBlink');
  assert.equal(s.store.state.longBlink, true);
});

test('only known keys with numbers (or yes / no, or how it points) are stored: nothing from the face (B28)', () => {
  const storage = memoryStorage();
  const s = new HandsFreeSettings({ storage });
  s.optIn('eyes');
  s.saveCalibration({ ...MODEL, samples: [{ v: [1, 2], target: { x: 0, y: 0 } }], landmarks: [{ x: 1, y: 2 }] }, 140);
  s.saveBlink(640);
  const stored = JSON.parse(storage.raw());
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(DEFAULTS).sort());
  const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : [v]);
  for (const [key, value] of Object.entries(stored)) {
    if (key === 'pointer') assert.ok(['eyes', 'head'].includes(value));
    else assert.ok(flat(value).every((v) => v === null || typeof v === 'number' || typeof v === 'boolean'), key);
  }
  assert.equal(stored.calibration.samples, undefined, 'the calibration samples never leave memory');
  assert.equal(stored.calibration.landmarks, undefined);
  assert.equal(stored.errorPx, 140);
  assert.equal(stored.blinkMs, 640);
});

test('whatever is stored is checked when it is read back: wrong types fall back, numbers are clamped', () => {
  const clean = sanitize({ optIn: 'yes', pointer: 'nose', eyesDwellMs: 99999, smoothing: 'x', calibration: { cx: [1, 2], cy: [] }, evil: '<script>' });
  assert.equal(clean.optIn, false);
  assert.equal(clean.pointer, 'eyes');
  assert.equal(clean.eyesDwellMs, 3000);
  assert.equal(clean.smoothing, DEFAULTS.smoothing);
  assert.equal(clean.calibration, null);
  assert.equal('evil' in clean, false);
  const old = sanitize({ calibration: { mx: 0.5, my: 0, sx: 0.1, sy: 0.05, cx: [1, 2, 3, 4, 5, 6], cy: [1, 2, 3, 4, 5, 6], ox: 0, oy: 0 } });
  assert.equal(old.calibration, null, 'a calibration of the old kind is dropped: it calibrates again');
  assert.deepEqual(sanitize({ calibration: MODEL }).calibration, MODEL);
  const broken = new HandsFreeSettings({ storage: memoryStorage({ [STORAGE_KEY]: '{not json' }) });
  assert.equal(broken.store.state.optIn, false);
});

test('from each frame only the face points, 10 blendshapes and the head matrix reach the logic (B29)', async () => {
  const { faceFromResult, BLENDSHAPES } = await import('../../renderer/services/faceTrackingService.js');
  const names = [...BLENDSHAPES, 'mouthSmileLeft', 'browInnerUp', 'jawOpen'];
  const result = {
    faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    faceBlendshapes: [{ categories: names.map((categoryName, i) => ({ categoryName, score: i / 100 })) }],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: Array.from({ length: 16 }, (_, i) => i) }],
  };
  const face = faceFromResult(result);
  assert.deepEqual(Object.keys(face).sort(), ['blendshapes', 'landmarks', 'matrix']);
  assert.deepEqual(Object.keys(face.blendshapes).sort(), [...BLENDSHAPES].sort(), 'smiles, brows and the rest are dropped');
  assert.equal(BLENDSHAPES.length, 10);
  assert.equal(face.matrix.length, 16);
  assert.equal(faceFromResult({ faceLandmarks: [] }), null);
  assert.equal(faceFromResult({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]] }).matrix, null);
});
