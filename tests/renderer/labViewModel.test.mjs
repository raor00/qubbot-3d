import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { DESIGN_FILE, serializeDesign, emptyDesign } from '../../renderer/models/circuitModel.js';
import { strings } from '../../renderer/i18n/es.js';
import { LabViewModel, SAVE_DELAY_MS, toBase64 } from '../../renderer/viewmodels/labViewModel.js';
import { createLabService, LAB_EXPORTS } from '../../renderer/services/labService.js';

const L = strings.lab;
const flush = () => new Promise((resolve) => setImmediate(resolve));

const UNO_LED = {
  version: 1,
  parts: [{ id: 'arduino-uno-1', type: 'arduino-uno', x: 0, z: 0, rot: 0 }, { id: 'led-1', type: 'led', x: 10, z: 0, rot: 0 }],
  wires: [],
};

function setup({ file = null, open = true, engines, bus = createEventBus(), saveResult = { ok: true } } = {}) {
  const disk = { text: file === null ? null : serializeDesign(file) };
  const saves = [];
  const exports = [];
  const labService = {
    available: true,
    load: async () => ({ ok: true, data: disk.text }),
    save: async (text) => { saves.push(text); if (saveResult.ok) disk.text = text; return saveResult; },
    exportFile: async (kind, content) => { exports.push([kind, content]); return { ok: true, data: { file: LAB_EXPORTS[kind] } }; },
  };
  const projectModel = { store: new Observable({ open, root: open ? '/p/robot' : null, session: open ? 1 : 0 }) };
  const vm = new LabViewModel({ projectModel, labService, bus, engines });
  return { vm, disk, saves, exports, projectModel, bus, state: () => vm.store.state };
}

const openProject = (projectModel, root = '/p/otro') => {
  const { session } = projectModel.store.state;
  projectModel.store.set({ open: true, root, session: session + 1 });
};

test('opening a project loads its design and checks it', async () => {
  const { state } = setup({ file: UNO_LED });
  await flush();
  assert.equal(state().open, true);
  assert.equal(state().loaded, true);
  assert.equal(state().design.parts.length, 2);
  assert.equal(state().check.parts['led-1'], 'yellow', 'the LED is not wired yet');
  assert.ok(state().sections.length > 0);
});

test('no file yet: an empty bench, nothing saved', async () => {
  const { state, saves } = setup({ file: null });
  await flush();
  assert.equal(state().loaded, true);
  assert.deepEqual(state().design, emptyDesign());
  assert.equal(saves.length, 0);
});

test('no project open: nothing loads and add does nothing', async () => {
  const { vm, state } = setup({ open: false });
  await flush();
  assert.equal(state().open, false);
  assert.equal(vm.add('led'), null);
});

test('a new project resets the bench and loads its own design', async () => {
  const { vm, state, projectModel, disk } = setup({ file: UNO_LED });
  await flush();
  vm.select('led-1');
  disk.text = null;
  openProject(projectModel);
  assert.equal(state().selected, null);
  await flush();
  assert.equal(state().design.parts.length, 0);
});

test('add puts a part on a free spot, selects it and saves after a pause', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, state, saves } = setup({ file: UNO_LED });
    await flush();
    const id = vm.add('led', { x: 10, z: 0 });
    assert.equal(id, 'led-2');
    const part = state().design.parts.find((p) => p.id === id);
    assert.notEqual(part.x, 10, 'it does not sit on top of led-1');
    assert.equal(state().selected, id);
    assert.equal(saves.length, 0);
    vm.add('buzzer');
    mock.timers.tick(SAVE_DELAY_MS - 1);
    assert.equal(saves.length, 0, 'debounced');
    mock.timers.tick(1);
    assert.equal(saves.length, 1, 'one save for both changes');
    assert.equal(JSON.parse(saves[0]).parts.length, 4);
  } finally { mock.timers.reset(); }
});

test('moving saves immediately on moveEnd', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, state, saves } = setup({ file: UNO_LED });
    await flush();
    vm.move('led-1', { x: 5, z: 3 });
    vm.move('led-1', { x: 6, z: 4 });
    assert.equal(saves.length, 0);
    vm.moveEnd('led-1');
    assert.equal(saves.length, 1);
    assert.deepEqual(JSON.parse(saves[0]).parts[1], { id: 'led-1', type: 'led', x: 6, z: 4, rot: 0 });
    mock.timers.tick(SAVE_DELAY_MS * 2);
    assert.equal(saves.length, 1, 'the pending save was folded into moveEnd');
    assert.equal(state().design.parts[1].x, 6);
  } finally { mock.timers.reset(); }
});

test('rotate and remove act on the selected part; remove takes its wires and the selection', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.pickPin('led-1', 'SIG');
  vm.pickPin('arduino-uno-1', 'D2');
  vm.select('led-1');
  vm.rotate();
  assert.equal(state().design.parts[1].rot, 1);
  vm.remove();
  assert.equal(state().design.parts.length, 1);
  assert.equal(state().design.wires.length, 0);
  assert.equal(state().selected, null);
});

test('pickPin: first pick waits, second pick on another part connects', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.pickPin('led-1', 'SIG');
  assert.deepEqual(state().wiring, { part: 'led-1', pin: 'SIG' });
  assert.equal(state().notice.text, L.bench.wiring(L.parts.led.name, 'SIG'));
  vm.pickPin('arduino-uno-1', 'D2');
  assert.equal(state().wiring, null);
  assert.equal(state().design.wires.length, 1);
  assert.deepEqual(state().design.wires[0].to, { part: 'arduino-uno-1', pin: 'D2' });
});

test('pickPin: the same pin again cancels; another pin of the same part restarts from it', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.pickPin('led-1', 'SIG');
  vm.pickPin('led-1', 'SIG');
  assert.equal(state().wiring, null);
  assert.equal(state().notice, null);
  vm.pickPin('led-1', 'SIG');
  vm.pickPin('led-1', 'GND');
  assert.deepEqual(state().wiring, { part: 'led-1', pin: 'GND' });
  assert.equal(state().design.wires.length, 0);
});

test('pickPin: a refused connection explains why', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.pickPin('led-1', 'SIG');
  vm.pickPin('arduino-uno-1', 'D2');
  vm.pickPin('arduino-uno-1', 'D2');
  vm.pickPin('led-1', 'SIG');
  assert.equal(state().design.wires.length, 1);
  assert.deepEqual(state().notice, { kind: 'warn', text: L.bench.connectRefused.duplicate });
  assert.equal(state().wiring, null);
});

test('autoWire wires one part, or all; without a board it says so', async () => {
  const { vm, state } = setup({ file: { ...UNO_LED, parts: [UNO_LED.parts[1]] } });
  await flush();
  vm.autoWire();
  assert.deepEqual(state().notice, { kind: 'warn', text: L.bench.noBoardForWire });
  vm.add('arduino-uno');
  vm.add('buzzer');
  vm.autoWire('led-1');
  assert.equal(state().design.wires.length, 2);
  assert.deepEqual(state().notice, { kind: 'ok', text: L.bench.autoWired(2) });
  vm.autoWire();
  assert.equal(state().design.wires.length, 4, 'the buzzer too');
  vm.autoWire();
  assert.deepEqual(state().notice, { kind: 'ok', text: L.bench.autoWired(0) });
  assert.equal(state().check.level, 'green');
});

test('autoWire on a board wires every part to that board', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.autoWire('arduino-uno-1');
  assert.equal(state().design.wires.length, 2);
  assert.ok(state().design.wires.every((w) => w.to.part === 'arduino-uno-1'));
});

test('removeWire and setQuery', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.autoWire('led-1');
  vm.removeWire(state().design.wires[0].id);
  assert.equal(state().design.wires.length, 1);
  vm.setQuery('servo');
  assert.equal(state().query, 'servo');
  assert.deepEqual(state().sections.map((s) => s.items.map((c) => c.id)), [['servo-sg90']]);
  vm.setQuery('distancia');
  assert.deepEqual(state().sections.flatMap((s) => s.items.map((c) => c.id)), ['hc-sr04'], 'searches the visible name');
});

test('escape: cancels wiring, then deselects, then stops the simulation', async () => {
  const simulate = (design, t) => ({ parts: {}, wires: {}, t });
  const { vm, state } = setup({ file: UNO_LED, engines: { simulate } });
  await flush();
  vm.autoWire();
  vm.toggleSim();
  vm.select('led-1');
  vm.pickPin('led-1', 'SIG');
  assert.equal(vm.escape(), true);
  assert.equal(state().wiring, null);
  assert.equal(state().selected, 'led-1');
  vm.escape();
  assert.equal(state().selected, null);
  assert.equal(state().sim.running, true);
  vm.escape();
  assert.equal(state().sim.running, false);
  assert.equal(vm.escape(), false, 'nothing left to undo');
});

test('disk changes: its own save is ignored, an outside change reloads', async () => {
  const bus = createEventBus();
  const { vm, state, disk } = setup({ file: UNO_LED, bus });
  await flush();
  vm.select('led-1');
  vm.move('led-1', { x: 20, z: 0 });
  vm.moveEnd('led-1');
  await flush();
  // The echo of its own save (main renumbers the wires: still the same design)
  vm.move('led-1', { x: 21, z: 0 }); // a newer change, not saved yet
  bus.emit(EVENTS.diskChanged, { paths: [DESIGN_FILE] });
  await flush();
  assert.equal(state().design.parts[1].x, 21, 'the echo does not undo the newer change');
  // The agent adds a part
  disk.text = serializeDesign({ ...UNO_LED, parts: [...UNO_LED.parts, { id: 'buzzer-1', type: 'buzzer', x: -10, z: 0, rot: 0 }] });
  vm.onDiskChanged(['src/other.js']);
  await flush();
  assert.equal(state().design.parts.length, 2, 'another file: nothing to do');
  bus.emit(EVENTS.diskChanged, { paths: [DESIGN_FILE] });
  await flush();
  assert.equal(state().design.parts.length, 3);
  assert.equal(state().selected, 'led-1', 'the selection survives when the part is still there');
});

test('a failed save tells the person', async () => {
  const { vm, state } = setup({ file: UNO_LED, saveResult: { ok: false, error: 'io' } });
  await flush();
  vm.moveEnd('led-1');
  await flush();
  assert.deepEqual(state().notice, { kind: 'error', text: L.bench.saveFailed });
});

test('a file with broken parts warns that they were dropped', async () => {
  const { state } = setup({ file: { ...UNO_LED, parts: [...UNO_LED.parts, { id: 'x', type: 'flux-capacitor', x: 0, z: 0, rot: 0 }] } });
  await flush();
  assert.equal(state().design.parts.length, 2);
  assert.deepEqual(state().notice, { kind: 'warn', text: L.bench.loadFailed });
});

test('simulation: refused while something is red; tick advances t and asks the engine', async () => {
  const calls = [];
  const simulate = (design, t) => { calls.push(t); return { parts: { 'led-1': { kind: 'led', on: t >= 500 } }, wires: {} }; };
  const { vm, state } = setup({ file: UNO_LED, engines: { simulate } });
  await flush();
  // 5 V straight into GND: a short
  vm.pickPin('led-1', 'GND');
  vm.pickPin('arduino-uno-1', '5V');
  vm.pickPin('led-1', 'GND');
  vm.pickPin('arduino-uno-1', 'GND');
  assert.equal(state().check.level, 'red');
  vm.toggleSim();
  assert.equal(state().sim.running, false);
  assert.deepEqual(state().notice, { kind: 'error', text: L.sim.blocked });
  vm.removeWire('w1');
  vm.toggleSim();
  assert.deepEqual(state().sim, { running: true, t: 0 });
  vm.tick(250);
  vm.tick(250);
  assert.equal(state().sim.t, 500);
  assert.equal(state().simState.parts['led-1'].on, true);
  assert.deepEqual(calls.slice(-2), [250, 500]);
  vm.toggleSim();
  assert.deepEqual(state().sim, { running: false, t: 0 });
  assert.equal(state().simState, null);
  vm.tick(100);
  assert.equal(state().sim.t, 0, 'no ticks while stopped');
});

test('simulation without its engine still runs, with no state', async () => {
  const { vm, state } = setup({ file: UNO_LED });
  await flush();
  vm.toggleSim();
  vm.tick(16);
  assert.equal(state().sim.running, true);
  assert.equal(state().simState, null);
});

test('enclosure: shown with its data, exploded, exported as STL in base64 and as OpenSCAD', async () => {
  const data = { ok: true, size: { w: 80, d: 60, h: 30 }, solids: [], cutouts: [] };
  const stl = new Uint8Array([1, 2, 3, 250]).buffer;
  const engines = { enclosureFor: () => data, toStl: () => stl, toScad: () => 'cube([80,60,30]);' };
  const { vm, state, exports } = setup({ file: UNO_LED, engines });
  await flush();
  vm.toggleEnclosure();
  assert.deepEqual(state().enclosure, { visible: true, exploded: false, data });
  vm.toggleExplode();
  assert.equal(state().enclosure.exploded, true);
  await vm.exportEnclosure('stl');
  assert.deepEqual(exports[0], ['stl', 'AQID+g==']);
  assert.deepEqual(state().notice, { kind: 'ok', text: L.enclosure.saved(LAB_EXPORTS.stl) });
  await vm.exportEnclosure('scad');
  assert.deepEqual(exports[1], ['scad', 'cube([80,60,30]);']);
  vm.toggleEnclosure();
  assert.deepEqual(state().enclosure, { visible: false, exploded: false, data });
});

test('enclosure without a board, or without its engine, says so', async () => {
  const { vm, state, exports } = setup({ file: { ...UNO_LED, parts: [UNO_LED.parts[1]] }, engines: { enclosureFor: () => ({ ok: false, reason: 'noBoard' }) } });
  await flush();
  vm.toggleEnclosure();
  assert.deepEqual(state().notice, { kind: 'warn', text: L.enclosure.noBoard });
  await vm.exportEnclosure('stl');
  assert.equal(exports.length, 0);
  const bare = setup({ file: UNO_LED });
  await flush();
  await bare.vm.exportEnclosure('stl');
  assert.equal(bare.exports.length, 0);
  assert.equal(bare.state().notice.kind, 'warn');
});

test('exportSketch saves the .ino, or says a board is missing', async () => {
  const sketchFor = (design) => (design.parts.some((p) => p.type === 'arduino-uno')
    ? { ok: true, code: 'void setup() {}\nvoid loop() {}\n', board: 'arduino-uno', libraries: [] }
    : { ok: false, reason: 'noBoard', code: '' });
  const { vm, state, exports } = setup({ file: UNO_LED, engines: { sketchFor } });
  await flush();
  await vm.exportSketch();
  assert.deepEqual(exports[0], ['ino', 'void setup() {}\nvoid loop() {}\n']);
  assert.deepEqual(state().notice, { kind: 'ok', text: L.sketch.saved(LAB_EXPORTS.ino) });
  vm.remove('arduino-uno-1');
  await vm.exportSketch();
  assert.equal(exports.length, 1);
  assert.deepEqual(state().notice, { kind: 'warn', text: L.sketch.noBoard });
});

test('toBase64 handles views and big buffers', () => {
  assert.equal(toBase64(new Uint8Array([104, 105])), 'aGk=');
  const big = new Uint8Array(100000).fill(65);
  assert.equal(toBase64(big.buffer).length, Math.ceil(100000 / 3) * 4);
});

test('labService: the desktop bridge, and the web fallback in memory', async () => {
  const calls = [];
  const bridge = { lab: {
    load: async () => { calls.push(['load']); return { ok: true, data: '{}' }; },
    save: async (text) => { calls.push(['save', text]); return { ok: true }; },
    export: async (kind, content) => { calls.push(['export', kind, content]); return { ok: true, data: { file: LAB_EXPORTS[kind] } }; },
  } };
  const desktop = createLabService(bridge);
  assert.equal(desktop.available, true);
  await desktop.load();
  await desktop.save('x');
  await desktop.exportFile('ino', 'code');
  assert.deepEqual(calls, [['load'], ['save', 'x'], ['export', 'ino', 'code']]);

  const web = createLabService({});
  assert.equal(web.available, false);
  assert.deepEqual(await web.load(), { ok: true, data: null });
  assert.deepEqual(await web.save('hola'), { ok: true });
  assert.deepEqual(await web.load(), { ok: true, data: 'hola' });
  assert.deepEqual(await web.exportFile('stl', 'AQID'), { ok: true, data: { file: 'laboratorio/caja.stl' } });
  assert.equal((await web.exportFile('exe', 'x')).ok, false);
});
