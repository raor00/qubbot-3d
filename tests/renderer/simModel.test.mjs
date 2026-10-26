import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDesign, addPart, connect, autoWire, checkDesign,
} from '../../renderer/models/circuitModel.js';
import { simulate, SIM_KINDS } from '../../renderer/models/simModel.js';

/* ---- helpers to build designs ---- */

// Safe pin-kind lookup for board pins (some keys contain digits).
const boardPins = (boardType) => ({ '5V': ['5v'], GND: ['gnd'], VIN: ['vin'], '3V3': ['3v3'] });
const partPinKinds = (type, pin) => {
  const map = {
    'hc-sr04': { VCC: ['5v'], GND: ['gnd'], TRIG: ['digital'], ECHO: ['digital'] },
    buzzer: { SIG: ['digital', 'pwm'], GND: ['gnd'] },
    led: { SIG: ['digital', 'pwm'], GND: ['gnd'] },
    potentiometer: { VCC: ['5v'], GND: ['gnd'], OUT: ['analog'] },
    servo: { VCC: ['5v'], SIG: ['pwm'], GND: ['gnd'] },
    soil: { VCC: ['5v'], GND: ['gnd'], AOUT: ['analog'] },
    ldr: { VCC: ['5v'], GND: ['gnd'], AOUT: ['analog'] },
    button: { SIG: ['digital'], GND: ['gnd'] },
    l298n: { '5V': ['5v'], ENA: ['pwm'], IN1: ['digital'], IN2: ['digital'], GND: ['gnd'] },
  };
  return map[type]?.[pin] ?? [];
};

// Add a board + one part and auto-wire everything.
const bench = (boardType, partType) => {
  let d = addPart(emptyDesign(), boardType, { x: 0, z: 0 }).design;
  const { design, id } = addPart(d, partType, { x: 5, z: 0 });
  return autoWire(design, id).design;
};

// Add a board + multiple parts and auto-wire one by one.
const benchMany = (boardType, ...partTypes) => {
  let d = addPart(emptyDesign(), boardType, { x: 0, z: 0 }).design;
  let next = d;
  const ids = [];
  for (const t of partTypes) {
    const { design, id } = addPart(next, t, { x: ids.length * 5 + 5, z: 0 });
    const r = autoWire(design, id);
    next = r.design;
    ids.push(id);
  }
  return { design: next, ids };
};

// Find a part by type in a design (parts is an array).
const findPart = (design, type) => design.parts.find((p) => p.type === type);

/* ---- basic contract ---- */

test('simulate returns { parts, wires } with correct shapes', () => {
  const d = bench('arduino-uno', 'led');
  const result = simulate(d, 0);
  assert.ok(result.parts);
  assert.ok(result.wires);
  for (const id of Object.keys(result.parts)) {
    assert.ok(result.parts[id].kind, `part ${id} has kind`);
  }
  for (const id of Object.keys(result.wires)) {
    assert.ok(typeof result.wires[id] === 'number', `wire ${id} has numeric flow`);
  }
});

test('SIM_KINDS is an object with expected keys', () => {
  assert.ok(SIM_KINDS);
  assert.equal(SIM_KINDS.led, 'led');
  assert.equal(SIM_KINDS.distance, 'distance');
});

/* ---- determinism ---- */

test('determinism: same tMs gives identical results', () => {
  const d = bench('arduino-uno', 'hc-sr04');
  const r1 = simulate(d, 12345);
  const r2 = simulate(d, 12345);
  assert.deepEqual(r1, r2);
});

test('determinism: different tMs gives different results (non-constant)', () => {
  const d = bench('arduino-uno', 'hc-sr04');
  const r1 = simulate(d, 0);
  const r2 = simulate(d, 3000);
  const dist1 = findPart(d, 'hc-sr04')?.id && r1.parts[findPart(d, 'hc-sr04').id];
  const dist2 = findPart(d, 'hc-sr04')?.id && r2.parts[findPart(d, 'hc-sr04').id];
  assert.ok(dist1 && dist2, 'found distance parts');
  // At t=0 the distance wave should be at the middle (32.5), at t=3000 (half period) it should be at the opposite.
  assert.notEqual(dist1.cm, dist2.cm, 'distance changes with time');
});

/* ---- LED behavior: no sensor ---- */

test('LED blinks at 1 Hz when there is no distance sensor', () => {
  const d = bench('arduino-uno', 'led');
  const ledId = findPart(d, 'led')?.id;

  // t=0 → on (first half of 1s period)
  assert.equal(simulate(d, 0).parts[ledId].on, true, 'LED on at t=0');
  // t=250 → still on
  assert.equal(simulate(d, 250).parts[ledId].on, true, 'LED on at t=250');
  // t=500 → off
  assert.equal(simulate(d, 500).parts[ledId].on, false, 'LED off at t=500');
  // t=750 → still off
  assert.equal(simulate(d, 750).parts[ledId].on, false, 'LED off at t=750');
  // t=1000 → on again
  assert.equal(simulate(d, 1000).parts[ledId].on, true, 'LED on at t=1000');
});

/* ---- distance sensor oscillation ---- */

test('hc-sr04 distance oscillates 5…60 cm with period ~6 s', () => {
  const d = bench('arduino-uno', 'hc-sr04');
  const distId = findPart(d, 'hc-sr04')?.id;

  const r0 = simulate(d, 0);
  assert.ok(distId, 'found distance part');
  const at0 = r0.parts[distId].cm;
  assert.ok(at0 >= 5 && at0 <= 60, `distance at t=0 is ${at0}`);

  // After 3 s (half period), distance should be on the other side.
  const r3 = simulate(d, 3000);
  const at3 = r3.parts[distId].cm;
  assert.ok(at3 >= 5 && at3 <= 60);
  assert.notEqual(at0, at3);

  // After 6 s (full period), should return to same value.
  const r6 = simulate(d, 6000);
  const at6 = r6.parts[distId].cm;
  assert.equal(at0, at6, 'full period returns to same value');
});

/* ---- servo follows distance ---- */

test('servo follows distance: min distance → 0°, max distance → 180°', () => {
  const { design, ids } = benchMany('arduino-uno', 'hc-sr04', 'servo-sg90');
  const servoId = ids[1]; // sensor=0, servo=1

  // t=1500: distance wave peak (sin=1) → ~60 cm → servo ≈ 180°
  const r1500 = simulate(design, 1500);
  assert.equal(r1500.parts[servoId].kind, 'servo');
  assert.ok(r1500.parts[servoId].angle >= 170, `servo angle at max distance: ${Math.round(r1500.parts[servoId].angle)}`);

  // t=0: distance ~32.5 cm (mid) → servo ≈ 90°
  const r0 = simulate(design, 0);
  assert.ok(r0.parts[servoId].angle >= 80 && r0.parts[servoId].angle <= 100,
    `servo at mid distance: ${Math.round(r0.parts[servoId].angle)}`);
});

test('servo bars 0→180→0 when there is no distance sensor', () => {
  const d = bench('arduino-uno', 'servo-sg90');
  const servoId = findPart(d, 'servo-sg90')?.id;

  // t=0 → 0
  assert.equal(Math.round(simulate(d, 0).parts[servoId].angle), 0, 'servo at 0 at t=0');
  // t=2000 (quarter of 4s cycle) → 180
  assert.equal(Math.round(simulate(d, 2000).parts[servoId].angle), 180, 'servo at 180 at t=2000');
  // t=4000 (half cycle) → 0
  assert.equal(Math.round(simulate(d, 4000).parts[servoId].angle), 0, 'servo at 0 at t=4000');
});

/* ---- LED turns on when close ---- */

test('LED turns on when distance < 20 cm', () => {
  const { design } = benchMany('arduino-uno', 'hc-sr04', 'led');
  const ledId = findPart(design, 'led')?.id;

  // At t=5000 the sine wave is near its minimum (~5 cm, sin≈-1), LED should be on.
  const r = simulate(design, 5000);
  assert.equal(r.parts[ledId].on, true, 'LED on when close (t=5000)');
});

/* ---- piece not connected / dead ---- */

test('piece not connected to board stays dead', () => {
  // Add an LED without wiring it.
  let d = addPart(emptyDesign(), 'arduino-uno', { x: 0, z: 0 }).design;
  const { design, id } = addPart(d, 'led', { x: 5, z: 0 });
  // No wires → the LED has no connection to the board.
  const r = simulate(design, 1000);
  assert.equal(r.parts[id].kind, 'led');
  assert.equal(r.parts[id].dead, true, 'unwired LED is dead');
});

test('piece with wiring issues is dead (missing pin)', () => {
  // Add an LED but only wire one pin (SIG), leave GND unwired → checkDesign marks it yellow.
  let d = addPart(emptyDesign(), 'arduino-uno', { x: 0, z: 0 }).design;
  const { design, id: ledId } = addPart(d, 'led', { x: 5, z: 0 });
  connect(design, { part: ledId, pin: 'SIG' }, { part: 'arduino-uno-1', pin: 'D13' });
  // GND is not wired → missing issue → dead.
  const r = simulate(design, 1000);
  assert.equal(r.parts[ledId].kind, 'led');
  assert.equal(r.parts[ledId].dead, true, 'LED with missing pin is dead');
});

test('piece with a short issue stays dead', () => {
  // Wire a part's power pin to both 5V and GND → short.
  let d = addPart(emptyDesign(), 'arduino-uno', { x: 0, z: 0 }).design;
  const { design, id: buzId } = addPart(d, 'buzzer', { x: 5, z: 0 });
  connect(design, { part: buzId, pin: 'SIG' }, { part: 'arduino-uno-1', pin: 'D2' });
  // Connect buzzer GND to board 5V → creates a short net (power and ground joined).
  connect(design, { part: buzId, pin: 'GND' }, { part: 'arduino-uno-1', pin: '5V' });
  const r = simulate(design, 1000);
  assert.equal(r.parts[buzId].dead, true, 'shorted buzzer is dead');
});

/* ---- display shows distance ---- */

test('display shows distance line when hc-sr04 is present', () => {
  const { design } = benchMany('arduino-uno', 'hc-sr04', 'oled-128x64');
  const dispId = findPart(design, 'oled-128x64')?.id;
  const r = simulate(design, 0);
  const display = r.parts[dispId];
  assert.equal(display.kind, 'display');
  assert.ok(display.lines[0].includes('Dist'), 'line 1 includes "Dist"');
  assert.ok(display.lines[0].includes('cm'), 'line 1 includes "cm"');
});

/* ---- flow values ---- */

test('power wire flow is 1 when both ends live', () => {
  const d = bench('arduino-uno', 'hc-sr04');
  const r = simulate(d, 0);
  // Find the VCC→5V power wire.
  const powerWire = d.wires.find((w) => {
    const kinds = [w.from, w.to].flatMap((e) => {
      const part = d.parts.find((p) => p.id === e.part);
      return partPinKinds(part.type, e.pin) || boardPins('arduino-uno')[e.pin] || [];
    });
    return kinds.includes('5v') && !kinds.includes('gnd');
  });
  if (powerWire) {
    assert.equal(r.wires[powerWire.id], 1, 'power wire flow is 1');
  }
});

test('power wire flow is 0 when a piece is dead', () => {
  // Dead buzzer: shorted.
  let d = addPart(emptyDesign(), 'arduino-uno', { x: 0, z: 0 }).design;
  const { design, id: buzId } = addPart(d, 'buzzer', { x: 5, z: 0 });
  connect(design, { part: buzId, pin: 'SIG' }, { part: 'arduino-uno-1', pin: 'D2' });
  connect(design, { part: buzId, pin: 'GND' }, { part: 'arduino-uno-1', pin: '5V' });

  const r = simulate(design, 1000);
  // Find the GND wire (which is actually wired to 5V, making it a short).
  const gndWire = design.wires.find((w) => {
    const kinds = [w.from, w.to].flatMap((e) => {
      const part = design.parts.find((p) => p.id === e.part);
      return partPinKinds(part.type, e.pin) || boardPins('arduino-uno')[e.pin] || [];
    });
    return kinds.includes('gnd') || kinds.includes('5v');
  });
  if (gndWire) {
    assert.equal(r.wires[gndWire.id], 0, 'wire to dead piece has flow 0');
  }
});

test('signal wire flow is between 0 and 1', () => {
  const d = bench('arduino-uno', 'hc-sr04');
  const r = simulate(d, 42);
  // Find a signal wire.
  const sigWire = d.wires.find((w) => {
    const kinds = [w.from, w.to].flatMap((e) => {
      const part = d.parts.find((p) => p.id === e.part);
      return partPinKinds(part.type, e.pin) || boardPins('arduino-uno')[e.pin] || [];
    });
    return kinds.includes('digital');
  });
  if (sigWire) {
    const flow = r.wires[sigWire.id];
    assert.ok(flow >= 0 && flow <= 1, `signal flow ${flow} in range`);
  }
});

test('signal wire flow is 0 for dead piece', () => {
  let d = addPart(emptyDesign(), 'arduino-uno', { x: 0, z: 0 }).design;
  const { design, id: ledId } = addPart(d, 'led', { x: 5, z: 0 });
  // Wire SIG and GND to the board, but wire GND to 5V instead → short → dead.
  connect(design, { part: ledId, pin: 'SIG' }, { part: 'arduino-uno-1', pin: 'D13' });
  connect(design, { part: ledId, pin: 'GND' }, { part: 'arduino-uno-1', pin: '5V' });
  const r = simulate(design, 100);
  // The LED is dead (red), so the VCC→5V power wire (which connects to the dead LED) has flow 0.
  const pwrWire = design.wires.find((w) => {
    const kinds = [w.from, w.to].flatMap((e) => {
      const part = design.parts.find((p) => p.id === e.part);
      return partPinKinds(part.type, e.pin) || boardPins('arduino-uno')[e.pin] || [];
    });
    return kinds.includes('5v') && !kinds.includes('gnd');
  });
  if (pwrWire) {
    assert.equal(r.wires[pwrWire.id], 0, 'wire to dead LED has flow 0');
  }
});

/* ---- PIR window detection ---- */

test('PIR detects in windows: 2 s of every 7 s', () => {
  const d = bench('arduino-uno', 'pir');
  const pirId = findPart(d, 'pir')?.id;

  // t=0 → within the 2 s window → detected.
  assert.equal(simulate(d, 0).parts[pirId].detected, true, 'PIR detected at t=0');
  // t=3000 → outside window → not detected.
  assert.equal(simulate(d, 3000).parts[pirId].detected, false, 'PIR not detected at t=3000');
  // t=7000 → back to window start.
  assert.equal(simulate(d, 7000).parts[pirId].detected, true, 'PIR detected at t=7000');
});

/* ---- climate (DHT22) ---- */

test('DHT22: temperature 22…28, humidity 40…60', () => {
  const d = bench('arduino-uno', 'dht22');
  const dhtId = findPart(d, 'dht22')?.id;

  for (let t = 0; t < 60000; t += 5000) {
    const r = simulate(d, t);
    assert.ok(r.parts[dhtId].c >= 22 && r.parts[dhtId].c <= 28, `temp ${r.parts[dhtId].c} at t=${t}`);
    assert.ok(r.parts[dhtId].h >= 40 && r.parts[dhtId].h <= 60, `hum ${r.parts[dhtId].h} at t=${t}`);
  }
});

/* ---- knob percent ---- */

test('potentiometer gives percent 0…100', () => {
  const d = bench('arduino-uno', 'potentiometer');
  const knobId = findPart(d, 'potentiometer')?.id;

  const r = simulate(d, 7500);
  assert.ok(r.parts[knobId].percent >= 0 && r.parts[knobId].percent <= 100);
});

/* ---- button ---- */

test('button pressed 0.5 s every 3 s', () => {
  const d = bench('arduino-uno', 'button');
  const btnId = findPart(d, 'button')?.id;

  // t=0 → pressed (first 0.5 s of 3 s period).
  assert.equal(simulate(d, 0).parts[btnId].pressed, true);
  // t=600 → not pressed.
  assert.equal(simulate(d, 600).parts[btnId].pressed, false);
  // t=3000 → pressed again.
  assert.equal(simulate(d, 3000).parts[btnId].pressed, true);
});

/* ---- buzzer and relay with distance ---- */

test('buzzer/relay on when distance < 20 cm', () => {
  const { design } = benchMany('arduino-uno', 'hc-sr04', 'buzzer', 'relay');
  const buzId = findPart(design, 'buzzer')?.id;
  const relId = findPart(design, 'relay')?.id;
  // t=5000 → distance ~5 cm → on.
  const r = simulate(design, 5000);
  assert.equal(r.parts[buzId].on, true, 'buzzer on when close');
  assert.equal(r.parts[relId].on, true, 'relay on when close');
});

test('buzzer/relay off when distance >= 20 cm', () => {
  const { design } = benchMany('arduino-uno', 'hc-sr04', 'buzzer', 'relay');
  const buzId = findPart(design, 'buzzer')?.id;
  const relId = findPart(design, 'relay')?.id;
  // t=0 → distance ~32.5 → off.
  const r = simulate(design, 0);
  assert.equal(r.parts[buzId].on, false, 'buzzer off at mid distance');
  assert.equal(r.parts[relId].on, false, 'relay off at mid distance');
});

/* ---- soil / LDR ---- */

test('soil and LDR give percent values', () => {
  const { design } = benchMany('arduino-uno', 'soil', 'ldr');
  const soilId = findPart(design, 'soil')?.id;
  const ldrId = findPart(design, 'ldr')?.id;
  const r = simulate(design, 10000);
  assert.ok(r.parts[soilId].percent >= 0 && r.parts[soilId].percent <= 100);
  assert.ok(r.parts[ldrId].percent >= 0 && r.parts[ldrId].percent <= 100);
});

/* ---- motors (L298N) follows knob ---- */

test('L298N speed follows knob when present', () => {
  const { design } = benchMany('arduino-uno', 'potentiometer', 'l298n');
  const motorId = findPart(design, 'l298n')?.id;
  // t=0 → knob at 0 → speed ≈ 0.
  const r0 = simulate(design, 0);
  assert.ok(r0.parts[motorId].speed >= 0 && r0.parts[motorId].speed <= 1);
  // t=7500 → knob at 100 (peak of tri wave period 15000, half=7500) → speed ≈ 1.
  const r1 = simulate(design, 7500);
  assert.ok(r1.parts[motorId].speed > 0.9, `speed near 1: ${r1.parts[motorId].speed}`);
});

/* ---- board state ---- */

test('board part always has running: true', () => {
  const d = bench('arduino-uno', 'led');
  const boardId = findPart(d, 'arduino-uno')?.id;
  const r = simulate(d, 99999);
  assert.equal(r.parts[boardId].kind, 'board');
  assert.equal(r.parts[boardId].running, true);
});

/* ---- large tMs (negative, overflow) ---- */

test('simulate handles negative and large tMs', () => {
  const d = bench('arduino-uno', 'hc-sr04');
  const rNeg = simulate(d, -1000);
  const rPos = simulate(d, 60000 - 1000);
  // Should not throw and should be well-formed.
  assert.ok(rNeg.parts);
  assert.ok(rNeg.wires);
  assert.ok(rPos.parts);
  assert.ok(rPos.wires);
});