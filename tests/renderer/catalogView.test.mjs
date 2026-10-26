import test from 'node:test';
import assert from 'node:assert/strict';
import { componentOf } from '../../renderer/models/componentCatalog.js';
import { emptyDesign, addPart, checkDesign } from '../../renderer/models/circuitModel.js';
import { MM } from '../../renderer/viewmodels/labLayout.js';
import {
  CATEGORY_ICONS, colorHex, partChips, partName, partLabel, issueText, issueRows, sectionsOf, PART_MIME, reviewSummary, enclosureFacts,
} from '../../renderer/views/ui/catalogItems.js';
import { footprintCorners } from '../../renderer/views/ui/labDropView.js';
import { CATEGORIES } from '../../renderer/models/componentCatalog.js';

const bench = (...types) => types.reduce((d, type, i) => addPart(d, type, { x: i * 8 }).design, emptyDesign());

test('every category has a small inline svg icon', () => {
  for (const c of CATEGORIES) assert.match(CATEGORY_ICONS[c], /^<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<\/svg>$/s, c);
});

test('the drag type is the one the contract names', () => {
  assert.equal(PART_MIME, 'application/x-qubbot-part');
});

test('colorHex pads the part color to six digits', () => {
  assert.equal(colorHex(0x1f6fa8), '#1f6fa8');
  assert.equal(colorHex(0x00ff00), '#00ff00');
  assert.equal(colorHex(0), '#000000');
});

test('chips: a part shows its volts, its mA and how many pins it has', () => {
  assert.deepEqual(partChips(componentOf('hc-sr04')), ['4.5–5.5 V', '15 mA', '4 pines']);
  assert.deepEqual(partChips(componentOf('led')), ['2–5 V', '20 mA', '2 pines']);
});

test('chips: a board shows its logic volts and pins, never a draw in mA; zero mA is left out', () => {
  assert.deepEqual(partChips(componentOf('esp32-devkit')), ['3.3 V', `${componentOf('esp32-devkit').pins.length} pines`]);
  assert.deepEqual(partChips(componentOf('button')), ['0–5 V', '2 pines']);
  assert.deepEqual(partChips(componentOf('battery-aa4')), ['6 V', '2 pines']);
});

test('partName uses the visible name, and falls back to the id', () => {
  assert.equal(partName('led'), 'LED');
  assert.equal(partName('nope'), 'nope');
});

test('partLabel adds the instance number only when there is more than one of that type', () => {
  const d = bench('arduino-uno', 'led', 'led');
  assert.equal(partLabel(d, 'arduino-uno-1'), 'Arduino Uno');
  assert.equal(partLabel(d, 'led-1'), 'LED 1');
  assert.equal(partLabel(d, 'led-2'), 'LED 2');
  assert.equal(partLabel(d, 'ghost-9'), 'ghost-9');
});

test('issueText turns a checker finding into plain Spanish with part names', () => {
  const d = bench('arduino-uno', 'led');
  assert.equal(issueText({ key: 'missing', part: 'led-1', pin: 'SIG' }, d), 'A LED le falta conectar SIG.');
  assert.equal(issueText({ key: 'noBoard' }, d), 'Falta una placa que controle las piezas.');
  assert.equal(issueText({ key: 'budget', part: 'arduino-uno-1', usedMa: 700, budgetMa: 500 }, d), 'La placa da 500 mA y le piden 700 mA: usa una fuente aparte.');
  assert.equal(issueText({ key: 'pinShared', part: 'led-1', pin: 'SIG', boardPin: 'D3' }, d), 'SIG de LED comparte el pin D3 con otra pieza.');
  assert.equal(issueText({ key: 'whatever', part: 'led-1' }, d), 'whatever');
});

test('issueRows: red first, a part only when it is on the bench, text ready to show', () => {
  const d = bench('led');
  const check = checkDesign(d);
  const rows = issueRows(d, check);
  assert.ok(rows.length >= 2);
  assert.equal(rows.find((r) => r.text.includes('Falta una placa')).part, null);
  assert.ok(rows.some((r) => r.part === 'led-1'));
  const mixed = issueRows(d, { issues: [{ level: 'yellow', key: 'missing', part: 'led-1', pin: 'GND' }, { level: 'red', key: 'short', part: 'gone-1' }] });
  assert.deepEqual(mixed.map((r) => [r.level, r.part]), [['red', null], ['yellow', 'led-1']]);
  assert.deepEqual(issueRows(d, null), []);
});

test('sectionsOf uses the view model sections, or builds them from the query', () => {
  const own = [{ category: 'boards', items: [] }];
  assert.equal(sectionsOf({ sections: own }), own);
  const found = sectionsOf({ query: 'servo' });
  assert.deepEqual(found.map((s) => s.category), ['actuators']);
  assert.deepEqual(found[0].items.map((c) => c.id), ['servo-sg90']);
  assert.equal(sectionsOf({ query: 'luz' })[0].items[0].id, 'ldr'); // by visible name too
});

test('footprintCorners: the part footprint on the ground, turned with rot', () => {
  const [w, d] = componentOf('arduino-uno').size.map((v) => v * MM);
  const flat = footprintCorners('arduino-uno', { x: 2, z: -1 });
  assert.equal(flat.length, 4);
  for (const p of flat) assert.equal(p.y, 0);
  const xs = flat.map((p) => p.x), zs = flat.map((p) => p.z);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - w) < 1e-9);
  assert.ok(Math.abs(Math.max(...zs) - Math.min(...zs) - d) < 1e-9);
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 2) < 1e-9);
  const turned = footprintCorners('arduino-uno', { x: 0, z: 0 }, 1);
  const tx = turned.map((p) => p.x);
  assert.ok(Math.abs(Math.max(...tx) - Math.min(...tx) - d) < 1e-9);
  assert.deepEqual(footprintCorners('nope', { x: 0, z: 0 }), []);
});

test('reviewSummary counts the dangers and the things to check', () => {
  const rows = [{ level: 'red' }, { level: 'yellow' }, { level: 'yellow' }];
  assert.deepEqual(reviewSummary(rows), { red: 1, yellow: 2, text: '1 peligro · 2 por revisar' });
  assert.equal(reviewSummary([{ level: 'yellow' }]).text, '1 por revisar');
  assert.equal(reviewSummary([]).text, '');
});

test('enclosureFacts gives the size and the print estimate, or null while there is no box', () => {
  assert.deepEqual(enclosureFacts({ data: { ok: true, size: { w: 120.4, d: 80.6, h: 40 }, printMinutes: 180, grams: 52.4 } }), {
    size: '120 × 81 × 40 mm',
    print: 'Unas 3 h de impresión · 52 g de PLA',
  });
  assert.equal(enclosureFacts({ data: { ok: false, reason: 'noBoard' } }), null);
  assert.equal(enclosureFacts({ data: null }), null);
  assert.equal(enclosureFacts(undefined), null);
});
