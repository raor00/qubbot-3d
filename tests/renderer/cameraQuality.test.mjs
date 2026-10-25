// A sharper, well-lit image for the gaze (spec/004-hands-free-control.md, B36-B37): the face camera asks for
// 1280 × 720 (the eyes get twice the pixels of 640 × 480; a camera that cannot falls back on its own), and the
// light is measured from a 32 × 24 thumbnail once a second (only a number goes on: nothing is kept).
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { videoConstraints } from '../../renderer/services/cameraLoop.js';
import { meanLuma } from '../../renderer/services/faceTrackingService.js';
import { positionCheck } from '../../renderer/models/gazeModel.js';
import { person } from './faceFixtures.mjs';

test('the face camera asks for 1280 × 720 as an ideal, video only; the hands keep 640 × 480', () => {
  const face = videoConstraints({ width: 1280, height: 720 });
  assert.deepEqual(face.video.width, { ideal: 1280 });
  assert.deepEqual(face.video.height, { ideal: 720 });
  assert.equal(face.video.facingMode, 'user');
  assert.equal(face.audio, false, 'never the microphone');
  assert.deepEqual(videoConstraints().video.width, { ideal: 640 });
});

test('the light is the mean luminance of the thumbnail, 0 (black) to 1 (white)', () => {
  const px = (r, g, b, n) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
  assert.equal(meanLuma(new Uint8ClampedArray(px(0, 0, 0, 4))), 0);
  assert.ok(Math.abs(meanLuma(new Uint8ClampedArray(px(255, 255, 255, 4))) - 1) < 1e-9);
  const grey = meanLuma(new Uint8ClampedArray(px(64, 64, 64, 8)));
  assert.ok(Math.abs(grey - 64 / 255) < 1e-9);
  assert.equal(meanLuma(new Uint8ClampedArray(0)), null);
});

test('too little light is a position problem, said before anything else but the face (B37)', () => {
  assert.equal(positionCheck(person(), { light: 0.1 }).issue, 'light');
  assert.deepEqual(positionCheck(person(), { light: 0.5 }), { ok: true, issue: null });
  assert.deepEqual(positionCheck(person()), { ok: true, issue: null }, 'not measured yet: no problem');
  assert.equal(positionCheck(null, { light: 0.1 }).issue, 'noFace');
});
