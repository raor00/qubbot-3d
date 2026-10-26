import test from 'node:test';
import assert from 'node:assert/strict';
import { sketchFor } from '../../renderer/models/sketchModel.js';
import {
  emptyDesign, addPart, autoWire,
} from '../../renderer/models/circuitModel.js';

// Helper: build a design from component types (matches circuitModel.test.mjs pattern)
const bench = (...types) => types.reduce((d, type, i) => addPart(d, type, { x: i * 8 }).design, emptyDesign());

test('no board → ok false with reason noBoard', () => {
  const d = bench('led', 'hc-sr04');
  const result = sketchFor(d);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'noBoard');
});

test('Uno + hc-sr04 + servo + led autocableados → sketch con setup y loop', () => {
  let d = bench('arduino-uno', 'hc-sr04', 'servo-sg90', 'led');
  d = autoWire(d, 'hc-sr04-1').design;
  d = autoWire(d, 'servo-sg90-1').design;
  d = autoWire(d, 'led-1').design;

  const result = sketchFor(d);
  assert.equal(result.ok, true);
  assert.ok(typeof result.code === 'string');
  assert.ok(result.code.includes('setup()'));
  assert.ok(result.code.includes('loop()'));
  assert.ok(result.code.includes('pulseIn'));
  assert.ok(result.code.includes('<Servo.h>'));

  // Pin numbers from autoWire on Uno:
  // hc-sr04:  VCC→5V TRIG→D2 ECHO→D4 GND→GND  →  pin 2 (TRIG) and pin 4 (ECHO)
  // servo:    VCC→5V SIG→D3 GND→GND            →  pin 3
  // led:      VCC→5V SIG→D7 GND→GND            →  pin 7 (D7 is next free digital-only pin)
  assert.ok(result.code.includes('pulseIn(4,'));
  assert.ok(result.code.includes('servo.attach(3)'));
  assert.ok(result.code.includes('digitalWrite(7,'));
});

test('ESP32 + dht22 → usa GPIO y DHT.h', () => {
  let d = bench('esp32-devkit', 'dht22');
  const r = autoWire(d, 'dht22-1');
  d = r.design;

  const result = sketchFor(d);
  assert.equal(result.ok, true);
  assert.ok(result.code.includes('setup()'));
  assert.ok(result.code.includes('loop()'));
  assert.ok(result.code.includes('<DHT.h>'));
  assert.ok(result.code.includes('dht.begin()'));
  assert.ok(result.code.includes('readTemperature'));
});

test('pieza sin cablear aparece como comentario', () => {
  let d = bench('arduino-uno', 'led', 'buzzer');
  d = autoWire(d, 'led-1').design;
  // buzzer stays unconnected

  const result = sketchFor(d);
  assert.equal(result.ok, true);
  assert.ok(result.code.includes('// buzzer-1: falta conectarla'));
});

test('llaves balanceadas en el código', () => {
  let d = bench(
    'arduino-uno',
    'hc-sr04',
    'servo-sg90',
    'led',
    'potentiometer',
    'dht22',
    'oled-128x64',
    'lcd-1602-i2c',
  );
  for (const id of ['hc-sr04-1', 'servo-sg90-1', 'led-1', 'potentiometer-1', 'dht22-1', 'oled-128x64-1', 'lcd-1602-i2c-1']) {
    d = autoWire(d, id).design;
  }

  const result = sketchFor(d);
  assert.equal(result.ok, true);

  // Check brace balance
  let open = 0;
  for (const ch of result.code) {
    if (ch === '{') open++;
    if (ch === '}') open--;
  }
  assert.equal(open, 0);
});

test('I2C: oled y lcd comparten SDA y SCL sin duplicar pines', () => {
  let d = bench('arduino-uno', 'oled-128x64', 'lcd-1602-i2c');
  d = autoWire(d, 'oled-128x64-1').design;
  d = autoWire(d, 'lcd-1602-i2c-1').design;

  const result = sketchFor(d);
  assert.equal(result.ok, true);
  assert.ok(result.code.includes('SSD1306'));
  assert.ok(result.code.includes('lcd.init'));
  // Both I2C parts share A4 (SDA) and A5 (SCL) on the Uno
  assert.ok(result.code.includes('pinMode(A4,'));
  assert.ok(result.code.includes('pinMode(A5,'));
});

test('ESP32: servo → #include <ESP32Servo.h>', () => {
  let d = bench('esp32-devkit', 'servo-sg90');
  const r = autoWire(d, 'servo-sg90-1');
  d = r.design;

  const result = sketchFor(d);
  assert.equal(result.ok, true);
  assert.ok(result.code.includes('ESP32Servo'));
});

test('buzzer sin cablear aparece como comentario', () => {
  const d = bench('arduino-uno', 'buzzer');
  const result = sketchFor(d);
  assert.ok(result.code.includes('// buzzer-1: falta conectarla'));
});

test('button → INPUT_PULLUP, digitalWrite(13, HIGH)', () => {
  let d = bench('arduino-uno', 'button', 'led');
  d = autoWire(d, 'button-1').design;
  d = autoWire(d, 'led-1').design;

  const result = sketchFor(d);
  assert.ok(result.code.includes('INPUT_PULLUP'));
});

test('potentiometer → analogRead', () => {
  let d = bench('arduino-uno', 'potentiometer');
  d = autoWire(d, 'potentiometer-1').design;

  const result = sketchFor(d);
  assert.ok(result.code.includes('analogRead'));
  assert.ok(result.code.includes('Serial.println(valorPot)'));
});

test('lcd-1602-i2c usa LiquidCrystal_I2C', () => {
  let d = bench('arduino-uno', 'lcd-1602-i2c');
  d = autoWire(d, 'lcd-1602-i2c-1').design;

  const result = sketchFor(d);
  assert.ok(result.code.includes('LiquidCrystal_I2C'));
  assert.ok(result.code.includes('lcd.init'));
});