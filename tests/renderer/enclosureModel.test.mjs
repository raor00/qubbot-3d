import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, componentOf } from '../../renderer/models/componentCatalog.js';
import { emptyDesign, addPart } from '../../renderer/models/circuitModel.js';
import { partBox, MM } from '../../renderer/viewmodels/labLayout.js';
import { enclosureFor, toStl, toScad, solidTriangles, solidVolume, triangleNormal, printEstimate, DEFAULTS } from '../../renderer/models/enclosureModel.js';
import { FEATURES, featuresOf } from '../../renderer/models/enclosureFeatures.js';

const bench = (...items) => items.reduce((d, [type, x = 0, z = 0, rot = 0]) => addPart(d, type, { x, z, rot }).design, emptyDesign());
const compact = () => bench(['arduino-uno', 0, 0], ['hc-sr04', 0, -6.5]);
const signedVolume = (tris) => tris.reduce((sum, [a, b, c]) => sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
const overlap = (a, b) => [0, 1, 2].reduce((v, i) => v * Math.max(0, Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])), 1);
const aabb = (s) => (s.kind === 'cylinder' ? { min: [s.center[0] - s.r, s.center[1], s.center[2] - s.r], max: [s.center[0] + s.r, s.center[1] + s.h, s.center[2] + s.r] } : s);

function readStl(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const tris = [];
  for (let i = 0; i < count; i++) {
    const at = 84 + i * 50;
    const f = (k) => view.getFloat32(at + k * 4, true);
    tris.push({ normal: [f(0), f(1), f(2)], v: [[f(3), f(4), f(5)], [f(6), f(7), f(8)], [f(9), f(10), f(11)]], attr: view.getUint16(at + 48, true) });
  }
  return { count, tris, header: new Uint8Array(buffer, 0, 80) };
}

test('a box is 12 triangles with outward normals and its exact volume', () => {
  const box = { kind: 'box', min: [1, 2, 3], max: [11, 7, 6], group: 'base' };
  const tris = solidTriangles(box);
  assert.equal(tris.length, 12);
  assert.ok(Math.abs(signedVolume(tris) - 150) < 1e-9);
  assert.equal(solidVolume(box), 150);
  const c = [6, 4.5, 4.5];
  for (const [a, b, d] of tris) {
    const n = triangleNormal(a, b, d);
    const mid = [0, 1, 2].map((i) => (a[i] + b[i] + d[i]) / 3 - c[i]);
    assert.ok(n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] > 0, 'normal points away from the center');
  }
});

test('cylinders and rings enclose their volume and stay watertight', () => {
  for (const solid of [
    { kind: 'cylinder', center: [5, 2, -3], r: 3, h: 4, segments: 24 },
    { kind: 'cylinder', center: [5, 2, -3], r: 3, rInner: 1.6, h: 4, segments: 24 },
  ]) {
    const tris = solidTriangles(solid);
    assert.equal(tris.length, solid.rInner ? 24 * 8 : 24 * 4);
    assert.ok(Math.abs(signedVolume(tris) - solidVolume(solid)) < 1e-6, 'outward windings');
    // every edge is used once in each direction
    const key = (p) => p.map((v) => v.toFixed(6)).join(',');
    const edges = new Map();
    for (const t of tris) for (let i = 0; i < 3; i++) {
      const e = `${key(t[i])}>${key(t[(i + 1) % 3])}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
    for (const [e, n] of edges) {
      const [a, b] = e.split('>');
      assert.equal(n, 1, `edge ${e} once`);
      assert.equal(edges.get(`${b}>${a}`), 1, `edge ${e} has a partner`);
    }
  }
});

test('no board, no box', () => {
  for (const d of [emptyDesign(), bench(['led']), null]) {
    const e = enclosureFor(d);
    assert.equal(e.ok, false);
    assert.equal(e.reason, 'noBoard');
    assert.deepEqual(e.solids, []);
  }
});

test('the box wraps every part footprint with clearance, in mm', () => {
  const d = bench(['arduino-uno', 0, 0], ['hc-sr04', 8, 0], ['servo-sg90', -8, 4, 1], ['oled-128x64', 0, 7.5]);
  const e = enclosureFor(d);
  assert.ok(e.ok);
  const c = DEFAULTS.clearance;
  for (const part of d.parts) {
    const b = partBox(part);
    const min = [(b.x - b.w / 2) / MM, (b.z - b.d / 2) / MM], max = [(b.x + b.w / 2) / MM, (b.z + b.d / 2) / MM];
    assert.ok(e.inner.min[0] <= min[0] - c + 1e-6 && e.inner.min[2] <= min[1] - c + 1e-6, `${part.id} min`);
    assert.ok(e.inner.max[0] >= max[0] + c - 1e-6 && e.inner.max[2] >= max[1] + c - 1e-6, `${part.id} max`);
    assert.ok(e.inner.max[1] >= (componentOf(part.type).kind === 'board' ? 4 : 0) + 2 + componentOf(part.type).size[2] + c - 1e-6, `${part.id} height`);
  }
  // walls are 2 mm around the cavity, the floor 2 mm, the lid 2 mm on top
  assert.ok(Math.abs(e.size.w - (e.inner.max[0] - e.inner.min[0] + 2 * DEFAULTS.wall)) < 1e-6);
  assert.ok(Math.abs(e.size.d - (e.inner.max[2] - e.inner.min[2] + 2 * DEFAULTS.wall)) < 1e-6);
  assert.ok(Math.abs(e.size.h - (e.wallsTop + DEFAULTS.lid)) < 1e-6);
  assert.equal(e.inner.min[1], DEFAULTS.floor);
  // the solids span exactly the outer box
  const all = e.solids.map(aabb);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(Math.min(...all.map((s) => s.min[i])) - e.outer.min[i]) < 1e-6);
    assert.ok(Math.abs(Math.max(...all.map((s) => s.max[i])) - e.outer.max[i]) < 1e-6);
  }
});

test('options change the wall, floor, lid and clearance', () => {
  const thin = enclosureFor(compact());
  const thick = enclosureFor(compact(), { wall: 3, clearance: 4 });
  assert.ok(thick.size.w > thin.size.w + 5);
  assert.equal(thick.config.wall, 3);
  assert.equal(enclosureFor(compact(), { wall: -5 }).config.wall, 1);
  assert.equal(enclosureFor(compact(), { wall: 'x' }).config.wall, DEFAULTS.wall);
});

test('a board gets one M3 standoff ring under each of its holes', () => {
  for (const board of COMPONENTS.filter((c) => c.kind === 'board')) {
    const e = enclosureFor(bench([board.id, 3, -2]));
    const posts = e.solids.filter((s) => s.tag === 'standoff');
    assert.equal(posts.length, board.holes.length, board.id);
    assert.equal(e.standoffs, board.holes.length);
    for (const p of posts) {
      assert.equal(p.kind, 'cylinder');
      assert.equal(p.r, 3);
      assert.equal(p.rInner, 1.6);
      assert.equal(p.center[1], DEFAULTS.floor, 'stands on the floor');
      assert.equal(p.group, 'base');
      assert.ok(p.center[0] - 3 >= e.inner.min[0] && p.center[0] + 3 <= e.inner.max[0], 'inside the box');
      assert.ok(p.center[2] - 3 >= e.inner.min[2] && p.center[2] + 3 <= e.inner.max[2], 'inside the box');
    }
  }
  assert.equal(enclosureFor(bench(['arduino-uno'], ['arduino-nano', 12, 0])).standoffs, 8);
});

test('standoffs follow the board when it turns', () => {
  const at = (rot) => enclosureFor(bench(['arduino-uno', 0, 0, rot])).solids.filter((s) => s.tag === 'standoff').map((s) => s.center);
  const [a, b] = [at(0), at(1)];
  // the first hole [14, 2.5] sits at local (-20.3, +24.2): a quarter turn sends it to (-24.2, -20.3)
  assert.deepEqual([a[0][0], a[0][2]], [-20.3, 24.2]);
  assert.deepEqual([b[0][0], b[0][2]], [-24.2, -20.3]);
});

test('the USB opening goes on the wall the port faces, and follows the rotation', () => {
  const wallOf = (rot) => enclosureFor(bench(['arduino-uno', 0, 0, rot])).cutouts.find((c) => c.label === 'usb');
  assert.equal(wallOf(0).wall, 'west');
  assert.equal(wallOf(1).wall, 'north');
  assert.equal(wallOf(2).wall, 'east');
  assert.equal(wallOf(3).wall, 'south');
  const usb = wallOf(0);
  assert.equal(usb.shape, 'rect');
  assert.ok(usb.max[2] - usb.min[2] >= 12, 'wider than the plug');
  assert.ok(usb.min[1] >= DEFAULTS.floor + DEFAULTS.standoff, 'above the board');
});

test('a port too far from its wall uses the nearest one', () => {
  // a part to the west of the Uno leaves its USB side far from the west wall
  const e = enclosureFor(bench(['arduino-uno', 0, 0], ['battery-aa4', -12, 0]));
  assert.notEqual(e.cutouts.find((c) => c.label === 'usb').wall, 'west');
});

test('the HC-SR04 facing a wall gets two round eyes of 8 mm on it', () => {
  const sides = { 0: 'north', 1: 'east', 2: 'south', 3: 'west' };
  for (const [rot, wall] of Object.entries(sides)) {
    const d = bench(['arduino-uno', 0, 0], ['hc-sr04', 0, 0, Number(rot)]);
    const e = enclosureFor(d);
    const eyes = e.cutouts.filter((c) => c.label === 'eyes');
    assert.equal(eyes.length, 2, `rot ${rot}`);
    assert.ok(eyes.every((c) => c.shape === 'round' && c.r === 8 && c.wall === wall), `rot ${rot} on the ${wall} wall`);
    // the wall has real openings: no wall solid covers an eye's center
    for (const eye of eyes) {
      const covered = e.solids.filter((s) => s.tag === wall).some((s) => [0, 1, 2].every((i) => eye.center[i] > s.min[i] && eye.center[i] < s.max[i]));
      assert.equal(covered, false, 'an eye is open');
    }
  }
  const e = enclosureFor(compact());
  const [a, b] = e.cutouts.filter((c) => c.label === 'eyes');
  assert.ok(Math.abs(Math.abs(a.center[0] - b.center[0]) - 26) < 1e-6, 'eyes 26 mm apart');
});

test('lid windows, the PIR dome and vents open the lid, not the walls', () => {
  const e = enclosureFor(bench(['arduino-uno', 0, 0], ['oled-128x64', 9, 0], ['pir', -9, 0], ['relay', 0, 7]));
  const on = (label) => e.cutouts.filter((c) => c.label === label);
  assert.equal(on('screen').length, 1);
  assert.equal(on('dome').length, 1);
  assert.equal(on('vents').length, 4 + 4);
  assert.ok(e.cutouts.filter((c) => ['screen', 'dome', 'vents'].includes(c.label)).every((c) => c.wall === 'lid'));
  assert.equal(on('dome')[0].r, 11);
  // the lid plate is carved: no plate box covers the dome's center or the window's center
  const plates = e.solids.filter((s) => s.tag === 'plate');
  const covers = (p) => plates.some((s) => p[0] > s.min[0] && p[0] < s.max[0] && p[2] > s.min[2] && p[2] < s.max[2]);
  assert.equal(covers(on('dome')[0].center), false);
  const w = on('screen')[0];
  assert.equal(covers([(w.min[0] + w.max[0]) / 2, 0, (w.min[2] + w.max[2]) / 2]), false);
  // and a rotated window swaps its sides
  const turned = enclosureFor(bench(['arduino-uno', 0, 0], ['oled-128x64', 9, 0, 1])).cutouts.find((c) => c.label === 'screen');
  assert.ok(Math.abs((turned.max[0] - turned.min[0]) - 14) < 1e-6 && Math.abs((turned.max[2] - turned.min[2]) - 24) < 1e-6);
});

test('a battery leaves its cable through the nearest wall', () => {
  const e = enclosureFor(bench(['arduino-uno', 0, 0], ['battery-aa4', 12, 0]));
  assert.equal(e.cutouts.find((c) => c.label === 'cable').wall, 'east');
});

test('base and lid are both non-empty and the lid carries the lip', () => {
  const e = enclosureFor(compact());
  const base = e.solids.filter((s) => s.group === 'base'), lid = e.solids.filter((s) => s.group === 'lid');
  assert.ok(base.length > 0 && lid.length > 0);
  assert.equal(lid.filter((s) => s.tag === 'lip').length, 4);
  assert.ok(base.some((s) => s.tag === 'floor'));
  for (const w of ['north', 'south', 'east', 'west']) assert.ok(base.some((s) => s.tag === w), w);
  // the lip fits inside the cavity with play, and sits right under the plate
  for (const s of lid.filter((s) => s.tag === 'lip')) {
    assert.ok(s.min[0] >= e.inner.min[0] + DEFAULTS.lipGap - 1e-6 && s.max[0] <= e.inner.max[0] - DEFAULTS.lipGap + 1e-6);
    assert.ok(s.min[2] >= e.inner.min[2] + DEFAULTS.lipGap - 1e-6 && s.max[2] <= e.inner.max[2] - DEFAULTS.lipGap + 1e-6);
    assert.equal(s.max[1], e.wallsTop);
  }
});

test('solids touch but never overlap, and openings stay open', () => {
  const d = bench(['arduino-uno', 0, 0], ['hc-sr04', 0, -6.5], ['oled-128x64', 9, 0, 1], ['pir', -9, 0], ['battery-aa4', 0, 7.5, 2], ['relay', 9, 7.5]);
  const e = enclosureFor(d);
  const boxes = e.solids.map(aabb);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.ok(overlap(boxes[i], boxes[j]) < 1e-6, `solids ${i} and ${j} overlap`);
  }
  for (const c of e.cutouts.filter((x) => x.shape === 'rect')) {
    const same = e.solids.filter((s) => s.kind === 'box' && (c.wall === 'lid' ? s.tag === 'plate' : s.tag === c.wall));
    for (const s of same) assert.ok(overlap(s, c) < 1e-6, `${c.id} is open`);
  }
  assert.ok(e.cutouts.length >= 8);
});

test('every solid has a positive size and finite numbers', () => {
  const e = enclosureFor(bench(['arduino-nano', 0, 0], ['lcd-1602-i2c', 0, 5], ['hc-sr04', 8, 0, 1], ['led', -6, 0]));
  for (const s of e.solids) {
    if (s.kind === 'box') for (let i = 0; i < 3; i++) assert.ok(s.max[i] > s.min[i] && Number.isFinite(s.min[i]) && Number.isFinite(s.max[i]));
    else assert.ok(s.r > 0 && s.h > 0 && s.segments >= 3 && s.center.every(Number.isFinite));
    assert.ok(['base', 'lid'].includes(s.group));
  }
});

test('toStl: valid binary STL with header, count, unit normals and no NaN', () => {
  const e = enclosureFor(compact());
  const buffer = toStl(e);
  assert.ok(buffer instanceof ArrayBuffer);
  const stl = readStl(buffer);
  const expected = e.solids.reduce((n, s) => n + solidTriangles(s).length, 0);
  assert.equal(stl.count, expected);
  assert.equal(buffer.byteLength, 84 + 50 * stl.count);
  assert.notEqual(new TextDecoder().decode(stl.header.slice(0, 5)), 'solid', 'a binary header must not look like ASCII STL');
  for (const t of stl.tris) {
    assert.ok(Math.abs(Math.hypot(...t.normal) - 1) < 1e-5, 'unit normal');
    assert.ok([...t.normal, ...t.v.flat()].every(Number.isFinite), 'no NaN');
    assert.equal(t.attr, 0);
    const n = triangleNormal(...t.v);
    assert.ok(n[0] * t.normal[0] + n[1] * t.normal[1] + n[2] * t.normal[2] > 0.999, 'normal agrees with the winding');
  }
});

test('toStl: base and lid alone, side by side by default, z up', () => {
  const e = enclosureFor(compact());
  const all = readStl(toStl(e)), base = readStl(toStl(e, 'base')), lid = readStl(toStl(e, 'lid'));
  assert.ok(base.count > 0 && lid.count > 0);
  assert.equal(all.count, base.count + lid.count);
  const bounds = (stl) => [0, 1, 2].map((i) => [Math.min(...stl.tris.flatMap((t) => t.v.map((p) => p[i]))), Math.max(...stl.tris.flatMap((t) => t.v.map((p) => p[i])))]);
  const [bx, by, bz] = bounds(base), [lx, ly, lz] = bounds(lid);
  assert.ok(Math.abs(bx[0]) < 1e-3 && Math.abs(by[0]) < 1e-3 && Math.abs(bz[0]) < 1e-3, 'base sits on the bed at the origin');
  assert.ok(Math.abs(bz[1] - e.wallsTop) < 1e-3, 'base height');
  assert.ok(Math.abs(bx[1] - e.size.w) < 1e-3 && Math.abs(by[1] - e.size.d) < 1e-3);
  assert.ok(Math.abs(lz[0]) < 1e-3 && Math.abs(lz[1] - (DEFAULTS.lid + DEFAULTS.lipHeight)) < 1e-3, 'lid flipped: plate on the bed, lip up');
  assert.ok(Math.abs(lx[0]) < 1e-3 && Math.abs(ly[0]) < 1e-3);
  // in the combined file the lid is moved beside the base
  const [ax] = bounds(all);
  assert.ok(ax[1] > e.size.w * 1.9, 'two pieces side by side');
  // the volume of the combined file matches the solids (outward windings, all pieces)
  const volume = all.tris.reduce((s, t) => s + signedVolume([t.v]), 0);
  assert.ok(Math.abs(volume - e.volume) / e.volume < 1e-3, 'STL volume = enclosure volume');
  // assembled keeps everything in one frame
  const joined = readStl(toStl(e, null, { assembled: true }));
  assert.equal(joined.count, all.count);
  assert.ok(Math.max(...joined.tris.flatMap((t) => t.v.map((p) => p[2]))) - e.size.h < 1e-3);
});

test('toScad: OpenSCAD with modules, difference, cutouts and balanced brackets', () => {
  const e = enclosureFor(compact());
  const scad = toScad(e);
  assert.match(scad, /module base\(\)/);
  assert.match(scad, /module lid\(\)/);
  assert.ok((scad.match(/difference\(\)/g) ?? []).length >= 3);
  assert.match(scad, /cube\(/);
  assert.match(scad, /cylinder\(/);
  assert.match(scad, /translate\(/);
  assert.ok(!/NaN|undefined|Infinity/.test(scad));
  for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
    assert.equal(scad.split(open).length, scad.split(close).length, `${open}${close} balanced`);
  }
  assert.equal((scad.match(/\$fn = 24/g) ?? []).length, 8, 'a ring (two cylinders) per standoff');
  assert.equal((scad.match(/hc-sr04-1 eyes/g) ?? []).length, 2);
  assert.match(toScad(enclosureFor(emptyDesign())), /^\/\//);
});

test('print estimate grows with the box and is documented in grams and minutes', () => {
  const small = enclosureFor(bench(['arduino-nano']));
  const big = enclosureFor(bench(['arduino-uno', 0, 0], ['lcd-1602-i2c', 0, 8], ['relay', 9, 0]));
  for (const e of [small, big]) {
    assert.ok(Number.isInteger(e.printMinutes) && e.printMinutes > 0);
    assert.ok(e.grams > 0 && e.volume > 0);
  }
  assert.ok(big.grams > small.grams && big.printMinutes > small.printMinutes);
  // plastic = volume * 0.84 (2 mm walls: 1.6 mm of shell + 20 % infill in the rest), PLA 1.24 g/cm3
  const got = printEstimate(10000, 20, 2);
  assert.equal(got.grams, Math.round(10000 * 0.84 / 1000 * 1.24 * 10) / 10);
  assert.ok(Math.abs(small.grams - Math.round(small.volume * 0.84 / 1000 * 1.24 * 10) / 10) < 0.11);
});

test('the features table only names real parts and well-formed features', () => {
  for (const [type, list] of Object.entries(FEATURES)) {
    assert.ok(componentOf(type), type);
    assert.equal(featuresOf(type), list);
    for (const f of list) {
      assert.ok(['port', 'eyes', 'window', 'hole', 'vents'].includes(f.kind), `${type} ${f.kind}`);
      assert.ok(f.label, type);
    }
  }
  assert.deepEqual(featuresOf('nope'), []);
  assert.ok(featuresOf('arduino-uno').some((f) => f.label === 'usb'));
  for (const c of COMPONENTS.filter((c) => c.kind === 'board')) assert.ok(featuresOf(c.id).some((f) => f.label === 'usb'), `${c.id} has a USB`);
});

test('every catalog part fits in a box without breaking it', () => {
  for (const c of COMPONENTS.filter((c) => c.kind === 'part')) {
    for (const rot of [0, 1, 2, 3]) {
      const e = enclosureFor(bench(['arduino-uno', 0, 0], [c.id, 0, 0, rot]));
      assert.ok(e.ok, c.id);
      const boxes = e.solids.map(aabb);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(overlap(boxes[i], boxes[j]) < 1e-6, `${c.id} rot ${rot}: ${i}/${j}`);
      const stl = readStl(toStl(e));
      assert.ok(stl.tris.every((t) => Number.isFinite(t.normal[0]) && Math.abs(Math.hypot(...t.normal) - 1) < 1e-5), c.id);
    }
  }
});

test('buildEnclosure: base and lid meshes, exploded view, intro animation', async (t) => {
  let THREE, mesh;
  try {
    THREE = await import('three');
    mesh = await import('../../renderer/views/scene/lab/enclosureMesh.js');
  } catch (error) {
    t.skip(`three.js is not available here: ${error.message}`);
    return;
  }
  const e = enclosureFor(compact());
  const view = mesh.buildEnclosure(e);
  assert.ok(view.group instanceof THREE.Group);
  assert.equal(typeof view.setExploded, 'function');
  assert.equal(typeof view.update, 'function');
  const meshes = [];
  view.group.traverse((o) => o.isMesh && meshes.push(o));
  assert.ok(meshes.length >= 6, 'floor, walls, standoffs and lid');
  assert.ok(meshes.every((m) => m.material.transparent));
  const box = new THREE.Box3().setFromObject(view.group);
  view.update(0, 5); // the intro is over
  const settled = new THREE.Box3().setFromObject(view.group);
  assert.ok(Math.abs((settled.max.x - settled.min.x) - e.size.w * 0.1) < 0.05, 'scaled mm to world units');
  assert.ok(settled.max.y < box.max.y, 'pieces started above');
  view.setExploded(true);
  view.update(1, 0.1);
  const mid = new THREE.Box3().setFromObject(view.group);
  view.update(2, 2);
  const open = new THREE.Box3().setFromObject(view.group);
  assert.ok(open.max.y > settled.max.y + 2, 'the lid lifts');
  assert.ok(open.max.x - open.min.x > settled.max.x - settled.min.x + 2, 'the walls open');
  assert.ok(mid.max.y > settled.max.y && mid.max.y < open.max.y, 'eased, not instant');
  view.setExploded(false);
  view.update(3, 2);
  const closed = new THREE.Box3().setFromObject(view.group);
  assert.ok(Math.abs(closed.max.y - settled.max.y) < 1e-6);
  // an empty enclosure builds an empty group
  assert.equal(mesh.buildEnclosure(enclosureFor(emptyDesign())).group.children.length, 0);
});
