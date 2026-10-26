import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, componentOf, catalogSections, CATEGORIES } from '../../renderer/models/componentCatalog.js';
import {
  emptyDesign, parseDesign, serializeDesign, addPart, movePart, removePart, rotatePart, connect, disconnect,
  checkDesign, autoWire, describeDesign,
} from '../../renderer/models/circuitModel.js';

const bench = (...types) => types.reduce((d, type, i) => addPart(d, type, { x: i * 8 }).design, emptyDesign());
const wire = (d, a, b) => {
  const [ap, aq] = a.split('.');
  const [bp, bq] = b.split('.');
  const r = connect(d, { part: ap, pin: aq }, { part: bp, pin: bq });
  assert.ok(r.ok, `${a} -> ${b}: ${r.reason}`);
  return r.design;
};
const keys = (d) => checkDesign(d).issues.map((i) => `${i.level}:${i.key}${i.pin ? `:${i.part}.${i.pin}` : ''}`).sort();

test('the catalog: every part has pins, a size, a source with a license and a known category', () => {
  const ids = new Set();
  for (const c of COMPONENTS) {
    assert.ok(!ids.has(c.id), `unique ${c.id}`);
    ids.add(c.id);
    assert.ok(CATEGORIES.includes(c.category), c.id);
    assert.equal(c.size.length, 3, c.id);
    assert.ok(c.pins.length >= 2, c.id);
    assert.ok(c.source?.license, `${c.id} has a license`);
    if (c.kind === 'board') assert.ok(c.pins.some((p) => p.kinds.includes('gnd')) && c.budgetMa > 0, c.id);
    else assert.ok(c.pins.every((p) => p.accepts.length), c.id);
  }
  assert.equal(componentOf('nope'), null);
  assert.deepEqual(catalogSections().map((s) => s.category), CATEGORIES);
  assert.deepEqual(catalogSections('servo').flatMap((s) => s.items.map((c) => c.id)), ['servo-sg90']);
});

test('adding, moving, turning and removing parts; a removed part takes its wires', () => {
  let d = bench('arduino-uno', 'led');
  assert.deepEqual(d.parts.map((p) => p.id), ['arduino-uno-1', 'led-1']);
  assert.equal(addPart(d, 'tostadora').id, null);
  d = movePart(d, 'led-1', { x: 3, z: -2 });
  assert.deepEqual([d.parts[1].x, d.parts[1].z], [3, -2]);
  d = rotatePart(rotatePart(rotatePart(rotatePart(rotatePart(d, 'led-1'), 'led-1'), 'led-1'), 'led-1'), 'led-1');
  assert.equal(d.parts[1].rot, 1);
  d = wire(d, 'led-1.SIG', 'arduino-uno-1.D13');
  d = removePart(d, 'led-1');
  assert.deepEqual(d.wires, []);
});

test('connecting: unknown pins, the same pin and a repeated wire are refused', () => {
  const d = bench('arduino-uno', 'led');
  assert.equal(connect(d, { part: 'led-1', pin: 'XX' }, { part: 'arduino-uno-1', pin: 'D2' }).reason, 'unknown');
  assert.equal(connect(d, { part: 'led-1', pin: 'SIG' }, { part: 'led-1', pin: 'SIG' }).reason, 'same');
  const once = wire(d, 'led-1.SIG', 'arduino-uno-1.D2');
  assert.equal(connect(once, { part: 'arduino-uno-1', pin: 'D2' }, { part: 'led-1', pin: 'SIG' }).reason, 'duplicate');
  assert.deepEqual(disconnect(once, once.wires[0].id).wires, []);
});

test('the file: round trip, and anything broken or unknown is dropped instead of breaking the bench', () => {
  const d = wire(bench('arduino-uno', 'led'), 'led-1.SIG', 'arduino-uno-1.D2');
  assert.deepEqual(parseDesign(serializeDesign(d)).design, d);
  const messy = parseDesign(JSON.stringify({
    parts: [{ id: 'a', type: 'arduino-uno', x: 1e9 }, { id: 'a', type: 'led' }, { id: 'b', type: 'tostadora' }, { id: 'c', type: 'led', rot: -1 }],
    wires: [{ from: { part: 'c', pin: 'SIG' }, to: { part: 'a', pin: 'D2' } }, { from: { part: 'c', pin: 'SIG' }, to: { part: 'zz', pin: 'D2' } }],
  }));
  assert.deepEqual(messy.design.parts.map((p) => [p.id, p.x, p.rot]), [['a', 500, 0], ['c', 0, 3]]);
  assert.equal(messy.design.wires.length, 1);
  assert.equal(messy.dropped, 3);
  assert.equal(parseDesign('{nope').error, 'json');
});

test('the checker: a good circuit is green', () => {
  let d = bench('arduino-uno', 'hc-sr04');
  d = wire(d, 'hc-sr04-1.VCC', 'arduino-uno-1.5V');
  d = wire(d, 'hc-sr04-1.GND', 'arduino-uno-1.GND');
  d = wire(d, 'hc-sr04-1.TRIG', 'arduino-uno-1.D2');
  d = wire(d, 'hc-sr04-1.ECHO', 'arduino-uno-1.D4');
  assert.deepEqual(checkDesign(d).issues, []);
  assert.equal(checkDesign(d).level, 'green');
  assert.deepEqual(checkDesign(d).budget, [{ board: 'arduino-uno-1', usedMa: 15, budgetMa: 500 }]);
});

test('the checker: shorts and mixed supplies are red, the part that caused it is red', () => {
  let d = bench('arduino-uno', 'led');
  d = wire(d, 'led-1.GND', 'arduino-uno-1.5V');
  assert.ok(keys(d).some((k) => k.startsWith('red:short')));
  assert.equal(checkDesign(d).level, 'red');
  let m = bench('arduino-uno', 'dht22');
  m = wire(m, 'dht22-1.VCC', 'arduino-uno-1.5V');
  m = wire(m, 'dht22-1.VCC', 'arduino-uno-1.3V3');
  assert.ok(keys(m).some((k) => k.startsWith('red:mixedPower')));
});

test('the checker: wrong pins, missing pins, shared pins, 5 V into a 3.3 V board, the power budget', () => {
  let d = bench('arduino-uno', 'servo-sg90', 'led');
  d = wire(d, 'servo-sg90-1.SIG', 'arduino-uno-1.D2'); // D2 has no PWM
  d = wire(d, 'led-1.SIG', 'arduino-uno-1.D2');
  const k = keys(d);
  assert.ok(k.includes('yellow:wrongPin:servo-sg90-1.SIG'));
  assert.ok(k.includes('yellow:missing:servo-sg90-1.VCC'));
  assert.ok(k.includes('yellow:missing:led-1.GND'));
  assert.ok(k.some((x) => x.startsWith('yellow:pinShared')));

  let e = bench('esp32-devkit', 'hc-sr04');
  e = autoWire(e, 'hc-sr04-1').design;
  assert.ok(keys(e).includes('yellow:level:hc-sr04-1.ECHO'), 'its echo sends 5 V into a 3.3 V pin');
  assert.ok(keys(e).includes('yellow:level:hc-sr04-1.TRIG'));

  let s = bench('arduino-uno', 'servo-sg90', 'servo-sg90', 'servo-sg90');
  ['servo-sg90-1', 'servo-sg90-2', 'servo-sg90-3'].forEach((id) => { s = autoWire(s, id).design; });
  assert.ok(keys(s).includes('yellow:budget'), '3 servos need more than USB gives');
  assert.deepEqual(keys(bench('led')), ['yellow:missing:led-1.GND', 'yellow:missing:led-1.SIG', 'yellow:noBoard']);
});

test('the I2C bus is shared without a warning; a 3.3 V-only part on 5 V would be red', () => {
  let d = bench('arduino-uno', 'oled-128x64', 'lcd-1602-i2c');
  d = autoWire(autoWire(d, 'oled-128x64-1').design, 'lcd-1602-i2c-1').design;
  assert.deepEqual(checkDesign(d).issues, []);
  assert.ok(d.wires.some((w) => w.to.pin === 'A4') && d.wires.some((w) => w.to.pin === 'A5'));
});

test('automatic wiring: power by voltage, ground shared, signals on free pins, scarce pins kept for who needs them', () => {
  let d = bench('arduino-uno', 'hc-sr04', 'servo-sg90', 'potentiometer');
  const r = autoWire(d, 'hc-sr04-1');
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.added.map((w) => `${w.from.pin}>${w.to.pin}`), ['VCC>5V', 'TRIG>D2', 'ECHO>D4', 'GND>GND']);
  d = autoWire(r.design, 'servo-sg90-1').design;
  assert.ok(d.wires.some((w) => w.from.part === 'servo-sg90-1' && w.from.pin === 'SIG' && w.to.pin === 'D3'));
  d = autoWire(d, 'potentiometer-1').design;
  assert.ok(d.wires.some((w) => w.from.part === 'potentiometer-1' && w.from.pin === 'OUT' && w.to.pin === 'A0'));
  assert.deepEqual(checkDesign(d).issues, []);
  // a 3.3 V board feeds a part that takes both from 3.3 V
  const esp = autoWire(bench('esp32-devkit', 'dht22'), 'dht22-1');
  assert.ok(esp.added.some((w) => w.from.pin === 'VCC' && w.to.pin === '3V3'));
  // no board: nothing to wire to
  assert.deepEqual(autoWire(bench('led'), 'led-1').missing, ['SIG', 'GND']);
});

test('the agent reads the bench as short lines', () => {
  const d = autoWire(bench('arduino-uno', 'led'), 'led-1').design;
  assert.equal(describeDesign(d), 'arduino-uno-1 (arduino-uno): D2→led-1.SIG, GND→led-1.GND\nled-1 (led): SIG→arduino-uno-1.D2, GND→arduino-uno-1.GND');
  assert.equal(describeDesign(emptyDesign()), '(banco vacío)');
});
