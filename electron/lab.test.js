// Tests for the lab's main-process side (electron/lab.js): the design file, the exports and the agent's
// lab tools. Run with `node --test electron/lab.test.js`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Workspace } = require('./workspace');
const lab = require('./lab');

async function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qubbot-lab-'));
  const workspace = new Workspace();
  await workspace.open(dir);
  return { workspace, root: workspace.root, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// A bench built through the tools, as the agent would
async function bench(...steps) {
  let design = { version: 1, parts: [], wires: [] };
  for (const [name, args] of steps) design = (await lab.applyLabTool(name, args, design)).design;
  return design;
}

test('the fixed files', () => {
  assert.equal(lab.DESIGN_FILE, 'laboratorio/circuito.json');
  assert.deepEqual(lab.EXPORT_FILES, { stl: 'laboratorio/caja.stl', scad: 'laboratorio/caja.scad', ino: 'laboratorio/circuito/circuito.ino' });
  assert.deepEqual(lab.LAB_TOOLS, ['lab_catalog', 'lab_view', 'lab_add_part', 'lab_connect', 'lab_auto_wire', 'lab_remove']);
  assert.deepEqual(lab.LAB_WRITE_TOOLS, ['lab_add_part', 'lab_connect', 'lab_auto_wire', 'lab_remove']);
});

test('normalizeDesign: validates with parseDesign and re-serializes; broken input is refused', async () => {
  const raw = JSON.stringify({ parts: [{ id: 'u', type: 'arduino-uno', x: 1, z: 2, rot: 5 }, { id: 'x', type: 'flux-capacitor' }], wires: [{ from: { part: 'u', pin: 'NOPE' }, to: { part: 'u', pin: 'GND' } }] });
  const { text, dropped } = await lab.normalizeDesign(raw);
  assert.equal(dropped, 2);
  assert.deepEqual(JSON.parse(text), { version: 1, parts: [{ id: 'u', type: 'arduino-uno', x: 1, z: 2, rot: 1 }], wires: [] });
  assert.ok(text.endsWith('\n'));
  await assert.rejects(lab.normalizeDesign('{not json'));
  await assert.rejects(lab.normalizeDesign(42));
  await assert.rejects(lab.normalizeDesign(' '.repeat(lab.MAX_DESIGN_BYTES + 1)));
});

test('save and load: only laboratorio/circuito.json, through the guard, canonical text', async () => {
  const { workspace, root, cleanup } = await project();
  try {
    assert.equal(await lab.loadDesignText(workspace), null);
    assert.deepEqual(await lab.readDesign(workspace), { version: 1, parts: [], wires: [] });
    const guarded = [];
    const guard = async (abs) => { guarded.push(abs); };
    const result = await lab.saveDesign(workspace, '{"parts":[{"id":"led-1","type":"led","x":3,"z":0,"rot":0}],"wires":[]}', { guard });
    assert.deepEqual(result, { dropped: 0 });
    assert.deepEqual(guarded, [path.join(root, 'laboratorio', 'circuito.json')]);
    assert.deepEqual(fs.readdirSync(path.join(root, 'laboratorio')), ['circuito.json']);
    const text = await lab.loadDesignText(workspace);
    assert.equal(JSON.parse(text).parts[0].id, 'led-1');
    assert.equal((await lab.readDesign(workspace)).parts.length, 1);
    // a guard that refuses stops the write
    await assert.rejects(lab.saveDesign(workspace, '{"parts":[]}', { guard: async () => { throw new Error('secret'); } }), /secret/);
    assert.equal(JSON.parse(await lab.loadDesignText(workspace)).parts.length, 1);
  } finally {
    cleanup();
  }
});

test('export: the three fixed paths only; the STL is written byte for byte from base64', async () => {
  const { workspace, root, cleanup } = await project();
  try {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 10, 13, 0]);
    assert.deepEqual(await lab.exportFile(workspace, 'stl', bytes.toString('base64')), { file: 'laboratorio/caja.stl' });
    assert.deepEqual(fs.readFileSync(path.join(root, 'laboratorio', 'caja.stl')), bytes);
    assert.deepEqual(await lab.exportFile(workspace, 'scad', 'cube([1,2,3]);'), { file: 'laboratorio/caja.scad' });
    assert.equal(fs.readFileSync(path.join(root, 'laboratorio', 'caja.scad'), 'utf8'), 'cube([1,2,3]);');
    assert.deepEqual(await lab.exportFile(workspace, 'ino', 'void setup() {}'), { file: 'laboratorio/circuito/circuito.ino' });
    assert.ok(fs.existsSync(path.join(root, 'laboratorio', 'circuito', 'circuito.ino')));
    for (const kind of ['json', '../x', 'constructor', '', null]) await assert.rejects(lab.exportFile(workspace, kind, 'x'), String(kind));
    await assert.rejects(lab.exportFile(workspace, 'stl', 'not base64 at all!'));
    await assert.rejects(lab.exportFile(workspace, 'stl', ''));
    await assert.rejects(lab.exportFile(workspace, 'scad', 42));
    await assert.rejects(lab.exportFile(workspace, 'ino', 'x', { guard: async () => { throw new Error('no'); } }), /no/);
  } finally {
    cleanup();
  }
});

test('lab_catalog: every component with its name, category, volts, mA and pins (read-only)', async () => {
  const design = { version: 1, parts: [], wires: [] };
  const r = await lab.applyLabTool('lab_catalog', {}, design);
  assert.equal(r.changed, false);
  assert.equal(r.design, design);
  const { COMPONENTS } = await import('../renderer/models/componentCatalog.js');
  const { lab: names } = await import('../renderer/i18n/lab.es.js');
  for (const c of COMPONENTS) {
    assert.ok(r.reply.includes(c.id), c.id);
    assert.ok(r.reply.includes(names.parts[c.id].name), c.id);
  }
  assert.match(r.reply, /hc-sr04.*Sensor de distancia.*4\.5–5\.5 V.*15 mA.*VCC, TRIG, ECHO, GND/);
  assert.match(r.reply, /arduino-uno.*Arduino Uno.*5 V.*500 mA/);
});

test('lab_add_part: puts a known part on the bench next to another one; unknown types are refused', async () => {
  const empty = { version: 1, parts: [], wires: [] };
  const a = await lab.applyLabTool('lab_add_part', { type: 'arduino-uno' }, empty);
  assert.equal(a.changed, true);
  assert.equal(a.design.parts[0].id, 'arduino-uno-1');
  assert.match(a.reply, /arduino-uno-1/);
  assert.match(a.reason, /Arduino Uno/);
  assert.ok(a.text.endsWith('\n') && JSON.parse(a.text).parts.length === 1);
  const b = await lab.applyLabTool('lab_add_part', { type: 'hc-sr04', near: 'arduino-uno-1' }, a.design);
  const [uno, sensor] = b.design.parts;
  assert.ok(sensor.x > uno.x, 'placed beside the board, not on top of it');
  assert.equal(empty.parts.length, 0, 'the input design is never mutated');
  await assert.rejects(lab.applyLabTool('lab_add_part', { type: 'flux-capacitor' }, empty), /flux-capacitor/);
  await assert.rejects(lab.applyLabTool('lab_add_part', {}, empty));
});

test('lab_connect: pieza.pin to pieza.pin; bad ends and red connections are refused', async () => {
  const design = await bench(['lab_add_part', { type: 'arduino-uno' }], ['lab_add_part', { type: 'hc-sr04' }]);
  const ok = await lab.applyLabTool('lab_connect', { from: 'hc-sr04-1.TRIG', to: 'arduino-uno-1.D2' }, design);
  assert.equal(ok.changed, true);
  assert.deepEqual(ok.design.wires[0], { id: 'w1', from: { part: 'hc-sr04-1', pin: 'TRIG' }, to: { part: 'arduino-uno-1', pin: 'D2' } });
  assert.match(ok.reply, /w1/);
  assert.match(ok.reply, /le falta conectar/); // the checker's yellow issues come back in plain Spanish
  for (const [from, to] of [['hc-sr04-1', 'arduino-uno-1.D2'], ['hc-sr04-1.NOPE', 'arduino-uno-1.D2'], ['x.TRIG', 'arduino-uno-1.D2'], ['hc-sr04-1.TRIG', 'hc-sr04-1.TRIG']]) {
    await assert.rejects(lab.applyLabTool('lab_connect', { from, to }, design), `${from} -> ${to}`);
  }
  await assert.rejects(lab.applyLabTool('lab_connect', { from: 'hc-sr04-1.TRIG', to: 'arduino-uno-1.D2' }, ok.design), /ya están conectados/);
  // 5 V straight into ground: the checker says red, so the agent cannot do it
  await assert.rejects(lab.applyLabTool('lab_connect', { from: 'arduino-uno-1.5V', to: 'arduino-uno-1.GND' }, design), /rojo/);
  // a 3.3 V-only part fed from 5 V is red too
  const esp = await bench(['lab_add_part', { type: 'arduino-uno' }], ['lab_add_part', { type: 'esp32-devkit' }]);
  await assert.rejects(lab.applyLabTool('lab_connect', { from: 'arduino-uno-1.5V', to: 'esp32-devkit-1.3V3' }, esp), /rojo/);
});

test('lab_auto_wire: one part or every part; without a board it is refused', async () => {
  const design = await bench(['lab_add_part', { type: 'arduino-uno' }], ['lab_add_part', { type: 'hc-sr04' }], ['lab_add_part', { type: 'led' }]);
  const one = await lab.applyLabTool('lab_auto_wire', { part: 'hc-sr04-1' }, design);
  assert.equal(one.changed, true);
  assert.equal(one.design.wires.length, 4);
  assert.ok(one.design.wires.every((w) => w.from.part === 'hc-sr04-1'));
  const all = await lab.applyLabTool('lab_auto_wire', {}, design);
  assert.equal(all.design.wires.length, 6);
  assert.match(all.reply, /bien conectado/);
  const again = await lab.applyLabTool('lab_auto_wire', {}, all.design);
  assert.equal(again.changed, false);
  await assert.rejects(lab.applyLabTool('lab_auto_wire', { part: 'nope-1' }, design), /nope-1/);
  const lonely = await bench(['lab_add_part', { type: 'led' }]);
  await assert.rejects(lab.applyLabTool('lab_auto_wire', {}, lonely), /placa/);
});

test('lab_remove: a part takes its wires with it; a wire alone; nothing named is refused', async () => {
  const wired = (await lab.applyLabTool('lab_auto_wire', {}, await bench(['lab_add_part', { type: 'arduino-uno' }], ['lab_add_part', { type: 'led' }]))).design;
  const noLed = await lab.applyLabTool('lab_remove', { part: 'led-1' }, wired);
  assert.equal(noLed.changed, true);
  assert.deepEqual(noLed.design.parts.map((p) => p.id), ['arduino-uno-1']);
  assert.equal(noLed.design.wires.length, 0);
  const noWire = await lab.applyLabTool('lab_remove', { wire: 'w1' }, wired);
  assert.equal(noWire.design.wires.length, 1);
  assert.match(noWire.reason, /cable/);
  await assert.rejects(lab.applyLabTool('lab_remove', {}, wired));
  await assert.rejects(lab.applyLabTool('lab_remove', { part: 'ghost' }, wired), /ghost/);
  await assert.rejects(lab.applyLabTool('lab_remove', { wire: 'w99' }, wired), /w99/);
});

test('lab_view: the bench in text plus the checker, unchanged; the MCP names work too', async () => {
  const design = await bench(['lab_add_part', { type: 'arduino-uno' }], ['lab_add_part', { type: 'led' }]);
  const r = await lab.applyLabTool('platanus_lab_view', {}, design);
  assert.equal(r.changed, false);
  assert.equal(r.design, design);
  assert.match(r.reply, /arduino-uno-1 \(arduino-uno\)/);
  assert.match(r.reply, /LED \(led-1\)/);
  assert.match((await lab.applyLabTool('lab_view', {}, { version: 1, parts: [], wires: [] })).reply, /vacío/);
  await assert.rejects(lab.applyLabTool('lab_explode', {}, design));
});

test('createQueue: runs one task at a time, in order, and survives a failure', async () => {
  const queue = lab.createQueue();
  const order = [];
  const slow = (id, ms, fail = false) => queue(() => new Promise((resolve, reject) => setTimeout(() => { order.push(id); fail ? reject(new Error(id)) : resolve(id); }, ms)));
  const results = await Promise.allSettled([slow('a', 30), slow('b', 1, true), slow('c', 1)]);
  assert.deepEqual(order, ['a', 'b', 'c']);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
});
