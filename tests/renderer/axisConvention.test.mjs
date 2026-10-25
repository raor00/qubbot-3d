// One axis convention for the hands-free control (spec/004-hands-free-control.md), pinned so nothing flips it
// again: MediaPipe gets the camera image as it comes (raw: the person's right is the image's left); only the
// small previews are mirrored, with CSS; and looking or turning to the person's right moves the cursor to the
// right, up moves it up, with the eyes and with the head.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HeadPointer } from '../../renderer/models/faceGesture.js';
import { GazeCalibration, gazeVector, predict, lookOf } from '../../renderer/models/gazeModel.js';
import { faceFromResult } from '../../renderer/services/faceTrackingService.js';
import { headAt, person, runCalibration } from './faceFixtures.mjs';

const css = (file) => fs.readFileSync(new URL(`../../renderer/styles/${file}`, import.meta.url), 'utf8');

test('the logic gets the image as it comes: no flip in the service', () => {
  const landmarks = [{ x: 0.2, y: 0.3, z: 0 }];
  assert.equal(faceFromResult({ faceLandmarks: [landmarks], faceBlendshapes: [] }).landmarks[0].x, 0.2);
});

test('only the previews are mirrored, with CSS (like a mirror)', () => {
  assert.match(css('handsfree.css'), /\.hf-video video\s*\{[^}]*transform:\s*scaleX\(-1\)/);
  assert.match(css('controls.css'), /\.hand-video video\s*\{[^}]*transform:\s*scaleX\(-1\)/);
  assert.doesNotMatch(css('handsfree.css'), /#hands-free-layer[^{]*\{[^}]*scaleX\(-1\)/, 'the layer itself is not mirrored');
});

test('with the head: turning to the person\'s right moves the cursor right; up moves it up', () => {
  const head = new HeadPointer({ smoothing: 0 });
  head.update(headAt(0, 0));
  assert.ok(head.update(headAt(-0.02, 0)).x > 0.5, 'the person\'s right is the image\'s left');
  const up = new HeadPointer({ smoothing: 0 });
  up.update(headAt(0, 0));
  assert.ok(up.update(headAt(0, -0.02)).y < 0.5);
});

test('with the eyes, once calibrated: looking to the person\'s right moves the cursor right; down moves it down', () => {
  const { model } = runCalibration(new GazeCalibration({ viewport: { width: 1000, height: 650 } })).done;
  const at = (look) => predict(model, gazeVector(person({ look })));
  assert.ok(at({ x: 0.8, y: 0.5 }).x > at({ x: 0.2, y: 0.5 }).x);
  assert.ok(at({ x: 0.5, y: 0.8 }).y > at({ x: 0.5, y: 0.2 }).y);
  // In the raw image, looking to the person's right moves the iris to the image's left; MediaPipe's own guess
  // calls it "right" (positive)
  assert.ok(gazeVector(person({ look: { x: 0.8, y: 0.5 } }))[0] < gazeVector(person({ look: { x: 0.2, y: 0.5 } }))[0]);
  assert.ok(lookOf(person({ look: { x: 0.8, y: 0.5 } }).blendshapes).x > 0);
});
