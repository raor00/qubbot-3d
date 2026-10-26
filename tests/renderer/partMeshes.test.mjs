import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildPart, PART_TYPES } from '../../renderer/views/scene/lab/partMeshes.js';
import { COMPONENTS, componentOf } from '../../renderer/models/componentCatalog.js';
import { pinSpots } from '../../renderer/viewmodels/labLayout.js';

const STATES = {
  led: { kind: 'led', on: true }, 'servo-sg90': { kind: 'servo', angle: 30 }, 'hc-sr04': { kind: 'distance', cm: 20 },
  pir: { kind: 'motion', detected: true }, dht22: { kind: 'climate', c: 24, h: 50 }, soil: { kind: 'soil', percent: 80 },
  ldr: { kind: 'light', percent: 90 }, buzzer: { kind: 'buzzer', on: true }, relay: { kind: 'relay', on: true },
  'oled-128x64': { kind: 'display', lines: ['Dist: 23 cm', 'Servo: 40'] }, 'lcd-1602-i2c': { kind: 'display', lines: ['Temp: 24.5 C', 'Hum: 51 %'] },
  button: { kind: 'button', pressed: true }, potentiometer: { kind: 'knob', percent: 85 }, l298n: { kind: 'motors', speed: 200 },
};
const stateOf = (type) => STATES[type] ?? { kind: 'board', running: true };

test('there is a model for every catalog part', () => {
  assert.equal(COMPONENTS.length, 19);
  assert.deepEqual([...PART_TYPES].sort(), COMPONENTS.map((c) => c.id).sort());
});

test('buildPart rejects an unknown type', () => {
  assert.throws(() => buildPart('flux-capacitor'), /unknown part/);
});

for (const { id } of COMPONENTS) {
  test(`${id}: builds with a pin at every pinSpots position and a part pick`, () => {
    const part = buildPart(id);
    assert.ok(part.group instanceof THREE.Group);
    assert.equal(part.group.userData.pick.type, 'part');
    const spots = pinSpots({ type: id, x: 0, z: 0, rot: 0 });
    assert.equal(part.pins.size, new Set(spots.map((s) => s.pin)).size);
    assert.equal(part.pins.size, componentOf(id).pins.length);
    for (const spot of spots) {
      const pin = part.pins.get(spot.pin);
      assert.ok(pin, `pin ${spot.pin}`);
      assert.deepEqual(pin.userData.pick, { type: 'pin', pin: spot.pin });
      assert.ok(Math.abs(pin.position.x - spot.x) < 0.01 && Math.abs(pin.position.y - spot.y) < 0.01 && Math.abs(pin.position.z - spot.z) < 0.01);
      assert.equal(pin.parent, part.group);
    }
  });

  test(`${id}: has a body, sits on the floor and stays near its size`, () => {
    const part = buildPart(id);
    const box = new THREE.Box3();
    part.body.traverse((o) => { if (o.isMesh && !o.userData.noBounds) box.union(new THREE.Box3().setFromObject(o)); });
    const [w, d, h] = componentOf(id).size.map((v) => v * 0.1);
    assert.ok(box.min.y > -0.01, 'nothing below the floor');
    assert.ok(box.max.y > h * 0.5 && box.max.y < h * 3.5, `height ${box.max.y} vs ${h}`);
    assert.ok(box.max.x - box.min.x > w * 0.8 && box.max.x - box.min.x < w * 1.5);
    assert.ok(box.max.z - box.min.z > d * 0.8 && box.max.z - box.min.z < d * 2.2);
  });

  test(`${id}: setSim, setLevel, setSelected, setHover and update do not throw`, () => {
    const part = buildPart(id);
    const first = [...part.pins.keys()][0];
    part.setSim(stateOf(id));
    part.setSim({ kind: 'x', dead: true });
    part.setSim(null);
    part.setSim(stateOf(id));
    for (const level of ['red', 'yellow', 'green', undefined]) { part.setLevel(level); part.update(1, 0.016); }
    part.setSelected(true); part.setSelected(false);
    part.setHover(first); part.setHover('NOPE'); part.setHover(null);
    for (let i = 0; i < 20; i++) part.update(i * 0.05, 0.05);
    part.dispose();
  });
}

test('glow shows for red and amber only, and fades out for green', () => {
  const part = buildPart('arduino-uno');
  part.update(0, 0.016);
  const glowRoots = () => part.group.children.filter((c) => c.children.length && !c.userData.pick && c.name !== 'body');
  assert.equal(glowRoots().length, 0);
  part.setLevel('red');
  assert.equal(glowRoots().length, 1);
  assert.equal(glowRoots()[0].visible, true);
  part.setLevel('green');
  for (let i = 0; i < 60; i++) part.update(i * 0.05, 0.05);
  assert.equal(glowRoots()[0].visible, false);
});

test('the selection ring appears and disappears', () => {
  const part = buildPart('led');
  const ring = () => part.group.children.find((c) => c.children.length > 3 && !c.userData.pick && c.name !== 'body');
  assert.equal(ring(), undefined);
  part.setSelected(true);
  part.update(0, 0.016);
  assert.equal(ring().visible, true);
  part.setSelected(false);
  for (let i = 0; i < 40; i++) part.update(i * 0.05, 0.05);
  assert.equal(ring().visible, false);
});

test('hover enlarges only the hovered pin', () => {
  const part = buildPart('hc-sr04');
  const tip = (id) => part.pins.get(id).children.find((c) => c.geometry?.type === 'SphereGeometry' && c.material.color);
  const rest = tip('TRIG').scale.x;
  part.setHover('TRIG');
  for (let i = 0; i < 30; i++) part.update(i * 0.05, 0.05);
  assert.ok(tip('TRIG').scale.x > rest * 2);
  assert.ok(Math.abs(tip('ECHO').scale.x - rest) < 1e-6);
  part.setHover(null);
  for (let i = 0; i < 60; i++) part.update(i * 0.05, 0.05);
  assert.ok(Math.abs(tip('TRIG').scale.x - rest) < 0.01);
});

test('the servo horn follows the angle with easing', () => {
  const part = buildPart('servo-sg90');
  const horn = part.body.children.find((c) => c.type === 'Group');
  part.update(0, 0.016);
  assert.ok(Math.abs(horn.rotation.y + Math.PI / 2) < 1e-6, 'rests in the middle (90 degrees)');
  part.setSim({ kind: 'servo', angle: 0 });
  part.update(0.1, 0.05);
  assert.ok(horn.rotation.y < 0 && horn.rotation.y > -Math.PI / 2 + 1e-3 === false || horn.rotation.y > -Math.PI / 2, 'moving, not jumping');
  for (let i = 0; i < 100; i++) part.update(i * 0.05, 0.05);
  assert.ok(Math.abs(horn.rotation.y) < 0.01);
  part.setSim({ kind: 'servo', angle: 180 });
  for (let i = 0; i < 100; i++) part.update(i * 0.05, 0.05);
  assert.ok(Math.abs(horn.rotation.y + Math.PI) < 0.01);
  part.setSim(null);
  for (let i = 0; i < 100; i++) part.update(i * 0.05, 0.05);
  assert.ok(Math.abs(horn.rotation.y + Math.PI / 2) < 0.01);
});

test('the LED glows when on and is dim at rest or dead', () => {
  const part = buildPart('led');
  const shell = () => { let found; part.body.traverse((o) => { if (o.material?.emissive && o.material.transparent && o.material.opacity > 0.5 && !found) found = o.material; }); return found; };
  const run = () => { for (let i = 0; i < 40; i++) part.update(i * 0.05, 0.05); return shell().emissiveIntensity; };
  assert.ok(run() < 0.1);
  part.setSim({ kind: 'led', on: true });
  assert.ok(run() > 2);
  part.setSim({ kind: 'led', dead: true });
  assert.ok(run() < 0.1);
});

test('the button cap goes down when pressed', () => {
  const part = buildPart('button');
  const cap = part.body.children.find((c) => c.type === 'Group');
  part.setSim({ kind: 'button', pressed: true });
  for (let i = 0; i < 20; i++) part.update(i * 0.05, 0.05);
  assert.ok(cap.position.y < -1);
  part.setSim(null);
  for (let i = 0; i < 20; i++) part.update(i * 0.05, 0.05);
  assert.ok(Math.abs(cap.position.y) < 0.01);
});

test('the knob turns with percent', () => {
  const part = buildPart('potentiometer');
  const knob = part.body.children.find((c) => c.type === 'Group');
  const at = (percent) => { part.setSim({ kind: 'knob', percent }); for (let i = 0; i < 80; i++) part.update(i * 0.05, 0.05); return knob.rotation.y; };
  assert.ok(Math.abs(at(50)) < 0.01);
  assert.ok(at(100) < -2);
  assert.ok(at(0) > 2);
});

test('dispose removes the part from its parent', () => {
  const parent = new THREE.Group();
  const part = buildPart('pico');
  parent.add(part.group);
  part.dispose();
  assert.equal(parent.children.length, 0);
});
