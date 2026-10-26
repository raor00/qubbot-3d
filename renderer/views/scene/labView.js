// The lab's bench in three.js: a work mat with the parts on it, wires arcing between their pins, and the
// printable enclosure around them. Draws from LabViewModel's store (diffing parts and wires by id, nothing
// is rebuilt on each change) and sends input back to it: drag a part, click a pin (twice to wire), click a
// wire to remove it. Everything lives in sceneView.layers.lab.
// Contract: docs/features/laboratorio/CONTRATOS.md. Parts come from lab/partMeshes.js, the box from
// lab/enclosureMesh.js, wires from lab/wireMeshes.js (math in lab/wireCurve.js).
import * as THREE from 'three';
import { PALETTE } from './materials.js';
import { buildPart } from './lab/partMeshes.js';
import { buildEnclosure } from './lab/enclosureMesh.js';
import { buildElasticWire, buildWire } from './lab/wireMeshes.js';
import { partAngle, wireCurve } from './lab/wireCurve.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';
import { componentOf } from '../../models/componentCatalog.js';
import { MM, partBox, pinSpot, pinSpots, wireKind } from '../../viewmodels/labLayout.js';

const L = strings.lab;

const SNAP = 0.25;          // dragged parts land on a quarter-unit grid (2.5 mm)
const LIFT = 0.22;          // how high a dragged part rises
const DROP_FROM = 1.4;      // a new part falls from this high
const DRAG_PX = 3;          // pointer travel that turns a press into a drag
const CLICK_PX = 6;         // pointer travel that is still a click
const PIN_HIT = 0.17;       // radius of the invisible sphere around each pin that takes the click
const LIMIT = 60;           // parts stay this close to the center of the bench
const MAT_MIN = { w: 18, d: 11 };
const MAT_MARGIN = 3.5;
const DECAL_PX = 56;        // texture pixels per world unit for the footprint decals
const DECAL_PAD = 0.8;
const COLORS = { warn: PALETTE.warn, danger: PALETTE.danger };

// --- Textures (canvas, shared by size) ---

function canvasTexture(width, height, draw) {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(width));
    canvas.height = Math.max(2, Math.ceil(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    draw(ctx, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// A blurred rounded rectangle for a w x d footprint (world units), white or black, with room around it
function softTexture(w, d, { color, blur, grow = 0 }) {
  const width = (w + DECAL_PAD * 2) * DECAL_PX, height = (d + DECAL_PAD * 2) * DECAL_PX;
  return canvasTexture(width, height, (ctx, cw, ch) => {
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = color;
    const g = grow * DECAL_PX;
    rounded(ctx, DECAL_PAD * DECAL_PX - g, DECAL_PAD * DECAL_PX - g, cw - DECAL_PAD * DECAL_PX * 2 + g * 2, ch - DECAL_PAD * DECAL_PX * 2 + g * 2, 10 + g);
    ctx.fill();
  });
}

// The selection frame: a crisp rounded outline with a soft glow, a little bigger than the part
function ringTexture(w, d) {
  const width = (w + DECAL_PAD * 2) * DECAL_PX, height = (d + DECAL_PAD * 2) * DECAL_PX;
  return canvasTexture(width, height, (ctx, cw, ch) => {
    const m = (DECAL_PAD - 0.3) * DECAL_PX;
    ctx.strokeStyle = '#fff';
    ctx.filter = 'blur(6px)';
    ctx.lineWidth = 9;
    rounded(ctx, m, m, cw - m * 2, ch - m * 2, 22);
    ctx.stroke();
    ctx.filter = 'none';
    ctx.lineWidth = 3;
    rounded(ctx, m, m, cw - m * 2, ch - m * 2, 22);
    ctx.stroke();
  });
}

// The mat: a dark surface with a faint grid, 5 x 5 cells per tile (1 cell = 1 world unit = 1 cm)
function gridTexture() {
  const cell = 48;
  const tex = canvasTexture(cell * 5, cell * 5, (ctx, w, h) => {
    ctx.fillStyle = '#16181c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i <= 5; i++) {
      ctx.fillStyle = i % 5 === 0 ? 'rgba(255,255,255,.085)' : 'rgba(255,255,255,.04)';
      ctx.fillRect(i * cell - 1, 0, 2, h);
      ctx.fillRect(0, i * cell - 1, w, 2);
    }
  });
  if (tex) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function decal(texture, { y, blending = THREE.NormalBlending, color = 0xffffff }) {
  if (!texture) return null;
  const mesh = new THREE.Mesh(flatPlane, new THREE.MeshBasicMaterial({
    map: texture, color, transparent: true, depthWrite: false, toneMapped: false, blending, opacity: 0,
  }));
  mesh.position.y = y;
  mesh.visible = false;
  mesh.raycast = () => {}; // decals are never picked
  mesh.renderOrder = 1;
  return mesh;
}

// --- Small helpers ---

const partName = (type) => L.parts[type]?.name ?? type;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const typing = (e) => e.target?.closest?.('input, textarea, select, [contenteditable="true"]');

// Which way the particles run along a wire made from -> to: power and buses go from the board to the part,
// ground comes back, a sensor's signal goes to the board and an actuator's comes from it
function flowsBackwards(design, wire, kind) {
  const typeOf = (id) => componentOf(design.parts.find((p) => p.id === id)?.type);
  const from = typeOf(wire.from.part), to = typeOf(wire.to.part);
  const fromBoard = from?.kind === 'board', toBoard = to?.kind === 'board';
  if (fromBoard === toBoard) return false;
  const part = fromBoard ? to : from;
  const towardBoard = kind === 'gnd' || (kind === 'signal' && ['sensors', 'inputs'].includes(part?.category));
  return towardBoard ? fromBoard : toBoard;
}

// The bench mat's target rectangle: around the parts with a margin, never smaller than a minimum
function benchBounds(design) {
  const boxes = design.parts.filter((p) => componentOf(p.type)).map(partBox);
  if (!boxes.length) return { cx: 0, cz: 0, w: MAT_MIN.w, d: MAT_MIN.d };
  const x0 = Math.min(...boxes.map((b) => b.x - b.w / 2)), x1 = Math.max(...boxes.map((b) => b.x + b.w / 2));
  const z0 = Math.min(...boxes.map((b) => b.z - b.d / 2)), z1 = Math.max(...boxes.map((b) => b.z + b.d / 2));
  const even = (v) => Math.ceil(v / 2) * 2;
  return {
    cx: Math.round((x0 + x1) / 2), cz: Math.round((z0 + z1) / 2),
    w: Math.max(MAT_MIN.w, even(x1 - x0 + MAT_MARGIN * 2)), d: Math.max(MAT_MIN.d, even(z1 - z0 + MAT_MARGIN * 2)),
  };
}

export function createLabView({ sceneView, labels, labViewModel: vm, cameraViewModel }) {
  const layer = sceneView.layers.lab;
  const canvas = sceneView.canvas;
  const parts = new Map();    // id -> entry (see addPart)
  const wires = new Map();    // id -> { wire, kind, sig, mid }
  const leaving = [];         // parts shrinking away before they are removed
  const targets = [];         // what a click can hit (kept as one array, so callers may hold on to it)
  const pinTargets = [];      // the pins' click spheres: tried first, so a pin wins over the body it sits on
  const textures = new Map();
  const pinSpheres = new Map();
  const pinMaterial = new THREE.MeshBasicMaterial({ visible: false });

  const partsGroup = new THREE.Group();
  const wiresGroup = new THREE.Group();
  layer.add(partsGroup, wiresGroup);

  // --- The mat ---
  const mat = { cx: 0, cz: 0, w: MAT_MIN.w, d: MAT_MIN.d, goal: { cx: 0, cz: 0, w: MAT_MIN.w, d: MAT_MIN.d }, placed: false };
  const gridMap = gridTexture();
  const matMesh = new THREE.Mesh(
    flatPlane,
    new THREE.MeshStandardMaterial({ color: gridMap ? 0xffffff : 0x16181c, map: gridMap, roughness: 0.95, metalness: 0 })
  );
  matMesh.position.y = 0.02;
  matMesh.receiveShadow = true;
  matMesh.raycast = () => {};
  const edge = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z))),
    new THREE.LineBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.4 })
  );
  edge.position.y = 0.03;
  edge.raycast = () => {};
  const vignette = decal(softTexture(1, 1, { color: '#000', blur: 18 }), { y: 0.004 });
  if (vignette) { vignette.material.opacity = 0.55; vignette.visible = true; }
  layer.add(matMesh, edge, ...(vignette ? [vignette] : []));

  function placeMat() {
    const { cx, cz, w, d } = mat;
    matMesh.position.set(cx, 0.02, cz);
    matMesh.scale.set(w, 1, d);
    edge.position.set(cx, 0.03, cz);
    edge.scale.set(w, 1, d);
    vignette?.position.set(cx, 0.004, cz);
    vignette?.scale.set(w + 4, 1, d + 4);
    const map = matMesh.material.map;
    if (map) {
      map.repeat.set(w / 5, d / 5);
      map.offset.set((cx - w / 2) / 5, -(cz + d / 2) / 5);
    }
  }
  placeMat();

  // --- Elastic wire and its markers ---
  const elastic = buildElasticWire();
  const mark = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.17, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.95, toneMapped: false, depthTest: false })
  );
  mark.visible = false;
  mark.renderOrder = 5;
  mark.raycast = () => {};
  const aim = mark.clone();
  aim.material = mark.material.clone();
  aim.scale.setScalar(0.7);
  layer.add(elastic.object, mark, aim);

  // --- Labels ---
  const hint = labels.add({
    html: `<strong>${escapeHtml(L.bench.empty)}</strong>`, anchor: { x: 0, y: 0.4, z: 0 }, className: 'folder sub lab-hint', hidden: true, layer: 'lab',
  });
  const pinTip = labels.add({ html: '', className: 'file lab-tip', hidden: true, layer: 'lab' });
  const wireTip = labels.add({ html: `<strong>${escapeHtml(L.bench.removeWire)}</strong>`, className: 'file lab-tip', hidden: true, layer: 'lab' });

  // --- Enclosure ---
  let box = null;              // { built, data }
  let boxDirtyAt = null;       // ms: the data changed, rebuild once it settles
  let boxExploded = false;

  // --- State kept between frames ---
  let cursor = null;           // last pointer position in the page
  let pending = null;          // pointer move waiting for this frame's hover check
  let pickCache = null;        // the pick for one pointer position, valid during one frame
  let hoverWire = null;
  let drag = null;
  let downAt = null;
  let lastFrame = -1;

  const state = () => vm.store.state;
  const designPart = (id) => state().design.parts.find((p) => p.id === id);

  // Where a pin is right now (the part may be lifted by a drag or a drop)
  function pinWorld(part, pin) {
    const spot = pinSpot(part, pin);
    if (!spot) return null;
    return { x: spot.x, y: spot.y + (parts.get(part.id)?.lift.y ?? 0), z: spot.z };
  }

  function rebuildTargets() {
    targets.length = 0;
    pinTargets.length = 0;
    for (const entry of parts.values()) { targets.push(entry.root); pinTargets.push(...entry.hits); }
    for (const { wire } of wires.values()) targets.push(wire.pickMesh);
  }

  // --- Parts ---

  function decalTextures(spec) {
    const [w, d] = spec.size.map((v) => v * MM);
    const key = `${w.toFixed(2)}x${d.toFixed(2)}`;
    if (!textures.has(key)) {
      textures.set(key, {
        shadow: softTexture(w, d, { color: '#000', blur: 12 }),
        halo: softTexture(w, d, { color: '#fff', blur: 20, grow: 0.25 }),
        ring: ringTexture(w, d),
        w, d,
      });
    }
    return textures.get(key);
  }

  // The click sphere of a pin: as big as PIN_HIT, but smaller when its neighbors are close
  function pinSphere(spot, spots) {
    const near = Math.min(...spots.filter((o) => o !== spot).map((o) => Math.hypot(o.x - spot.x, o.z - spot.z)));
    const r = Math.round(clamp(near * 0.48, 0.06, PIN_HIT) * 100) / 100;
    if (!pinSpheres.has(r)) pinSpheres.set(r, new THREE.SphereGeometry(r, 8, 6));
    return pinSpheres.get(r);
  }

  function addPart(part, animate) {
    const spec = componentOf(part.type);
    if (!spec) return null;
    let built;
    try {
      built = buildPart(part.type);
    } catch (error) {
      console.error('lab: could not build', part.type, error);
      return null;
    }
    const root = new THREE.Group();
    root.userData.pick = { type: 'part', part: part.id };
    const tex = decalTextures(spec);
    const planeSize = [tex.w + DECAL_PAD * 2, tex.d + DECAL_PAD * 2];
    const shadow = decal(tex.shadow, { y: 0.034 });
    const halo = decal(tex.halo, { y: 0.038, blending: THREE.AdditiveBlending });
    const ring = decal(tex.ring, { y: 0.042, color: PALETTE.accent });
    for (const d of [shadow, halo, ring]) if (d) { d.scale.set(planeSize[0], 1, planeSize[1]); root.add(d); }
    root.add(built.group);

    // every pick below this part names it; each pin also gets an invisible sphere that is easy to click
    built.group.traverse((o) => { if (o.userData.pick) o.userData.pick = { ...o.userData.pick, part: part.id }; });
    for (const [pin, object] of built.pins) object.userData.pick = { type: 'pin', pin, part: part.id };
    const hits = [];
    const spots = pinSpots({ type: part.type, x: 0, z: 0, rot: 0 });
    for (const spot of spots) {
      const hit = new THREE.Mesh(pinSphere(spot, spots), pinMaterial);
      hit.position.set(spot.x, spot.y, spot.z);
      hit.userData.pick = { type: 'pin', pin: spot.pin, part: part.id };
      built.group.add(hit);
      hits.push(hit);
    }

    const entry = {
      hits,
      id: part.id, type: part.type, root, built, shadow, halo, ring,
      x: part.x, z: part.z, rot: part.rot, base: planeSize,
      lift: { y: animate ? DROP_FROM : 0, v: 0, target: 0 },
      level: null, selected: null, hoverPin: undefined, simState: undefined, leave: 0,
    };
    root.position.set(part.x, 0, part.z);
    root.rotation.y = partAngle(part.rot);
    partsGroup.add(root);
    parts.set(part.id, entry);
    return entry;
  }

  function removePart(entry) {
    parts.delete(entry.id);
    leaving.push(entry);
  }

  function syncParts(design, animate) {
    const ids = new Set(design.parts.map((p) => p.id));
    for (const entry of [...parts.values()]) if (!ids.has(entry.id)) removePart(entry);
    for (const part of design.parts) {
      const entry = parts.get(part.id) ?? addPart(part, animate);
      if (!entry) continue;
      if (entry.type !== part.type) { // the same id with another type: rebuild it
        removePart(entry);
        addPart(part, false);
        continue;
      }
      if (entry.x !== part.x || entry.z !== part.z) {
        entry.x = part.x;
        entry.z = part.z;
        entry.root.position.set(part.x, 0, part.z);
      }
      if (entry.rot !== part.rot) {
        entry.rot = part.rot;
        entry.root.rotation.y = partAngle(part.rot);
        entry.lift.v = Math.max(entry.lift.v, 2.4); // a small hop as it turns
      }
    }
    rebuildTargets();
  }

  // --- Wires ---

  function syncWires(design, animate) {
    const ids = new Set();
    const pairs = new Map();
    let changed = false;
    for (const w of design.wires) {
      const a = design.parts.find((p) => p.id === w.from.part), b = design.parts.find((p) => p.id === w.to.part);
      const pa = a && pinWorld(a, w.from.pin), pb = b && pinWorld(b, w.to.pin);
      if (!pa || !pb) continue;
      ids.add(w.id);
      // wires between the same two parts fan out sideways; the curve is always built from the part with the
      // smaller id, so two wires going opposite ways do not fall on the same side
      const key = [a.id, b.id].sort().join('|');
      const index = pairs.get(key) ?? 0;
      pairs.set(key, index + 1);
      const swap = a.id > b.id;
      let points = wireCurve(swap ? pb : pa, swap ? pa : pb, { index });
      if (swap) points = points.reverse();
      const kind = wireKind(design, w);
      const sig = `${kind}|${index}|${points[0].x.toFixed(3)},${points[0].y.toFixed(3)},${points[0].z.toFixed(3)}|${points.at(-1).x.toFixed(3)},${points.at(-1).y.toFixed(3)},${points.at(-1).z.toFixed(3)}`;
      const reverse = flowsBackwards(design, w, kind);
      let item = wires.get(w.id);
      if (item && item.kind !== kind) { item.wire.dispose(); wires.delete(w.id); item = null; }
      if (!item) {
        const wire = buildWire({ id: w.id, kind, points, reverse, reveal: animate });
        wiresGroup.add(wire.group);
        item = { wire, kind, sig, mid: points[points.length >> 1] };
        wires.set(w.id, item);
        changed = true;
        continue;
      }
      item.wire.setReverse(reverse);
      if (item.sig !== sig) {
        item.sig = sig;
        item.mid = points[points.length >> 1];
        item.wire.setPoints(points);
      }
    }
    for (const [id, item] of [...wires]) {
      if (ids.has(id)) continue;
      item.wire.dispose();
      wires.delete(id);
      if (hoverWire === id) setHoverWire(null);
      changed = true;
    }
    if (changed) rebuildTargets();
  }

  function setHoverWire(id) {
    if (hoverWire === id) return;
    wires.get(hoverWire)?.wire.setHot(false);
    hoverWire = id;
    const item = wires.get(id);
    item?.wire.setHot(true);
    wireTip.el.hidden = !item;
    if (item) wireTip.setAnchor(item.mid.x, item.mid.y + 0.3, item.mid.z);
  }

  // --- Enclosure ---

  function mountEnclosure(data) {
    unmountEnclosure();
    let built;
    try {
      built = buildEnclosure(data);
    } catch (error) {
      console.error('lab: could not build the enclosure', error);
      return;
    }
    // the builder's group already scales mm to world units and sits on the bench floor: add it as is
    layer.add(built.group);
    built.setExploded(boxExploded);
    box = { built, data };
  }

  function unmountEnclosure() {
    if (!box) return;
    box.built.group.removeFromParent();
    box.built.dispose?.();
    box = null;
  }

  function syncEnclosure(s, now) {
    const e = s.enclosure;
    const want = Boolean(e?.visible && e.data?.ok);
    if (!want) { unmountEnclosure(); boxDirtyAt = null; return; }
    if (!box) mountEnclosure(e.data);
    else if (box.data !== e.data) boxDirtyAt = boxDirtyAt ?? now;
    if (Boolean(e.exploded) !== boxExploded) {
      boxExploded = Boolean(e.exploded);
      box?.built.setExploded(boxExploded);
    }
  }

  // --- Store -> scene ---

  function sync(s, prev) {
    const animate = Boolean(prev?.loaded && s.loaded && prev.open && s.open);
    if (!prev || s.design !== prev.design) {
      syncParts(s.design, animate);
      syncWires(s.design, animate);
      Object.assign(mat.goal, benchBounds(s.design));
      if (!mat.placed) { Object.assign(mat, mat.goal, { placed: true }); placeMat(); }
    }
    for (const entry of parts.values()) {
      const level = s.check?.parts?.[entry.id] ?? 'green';
      if (entry.level !== level) { entry.level = level; entry.built.setLevel(level); }
      const selected = s.selected === entry.id;
      if (entry.selected !== selected) { entry.selected = selected; entry.built.setSelected(selected); }
      const pin = s.hover?.part === entry.id ? s.hover.pin : null;
      if (entry.hoverPin !== pin) { entry.hoverPin = pin; entry.built.setHover(pin); }
    }
    // hover label
    const hover = s.hover && designPart(s.hover.part);
    const spot = hover && pinWorld(hover, s.hover.pin);
    pinTip.el.hidden = !spot;
    if (spot) {
      pinTip.el.innerHTML = `<strong>${escapeHtml(L.bench.pinTip(partName(hover.type), s.hover.pin))}</strong>`;
      pinTip.setAnchor(spot.x, spot.y + 0.35, spot.z);
    }
    hint.el.hidden = !(s.open && s.loaded && !s.design.parts.length);
    syncEnclosure(s, performance.now());
  }

  // --- Frame ---

  const step = (lift, dt) => {
    // a springy rise and fall, a little bouncy when it lands
    const accel = 90 * (lift.target - lift.y) - 11 * lift.v;
    lift.v += accel * dt;
    lift.y += lift.v * dt;
    if (lift.y < 0) { lift.y = 0; lift.v = Math.abs(lift.v) * 0.3; }
    if (Math.abs(lift.y - lift.target) < 0.002 && Math.abs(lift.v) < 0.02) { lift.y = lift.target; lift.v = 0; return false; }
    return true;
  };

  function frame(t, dt) {
    if (t === lastFrame || !layer.visible) return;
    lastFrame = t;
    pickCache = null;
    dt = Math.min(dt, 0.1);
    if (state().sim?.running) vm.tick(dt * 1000);
    const s = state();
    const sim = s.sim?.running ? s.simState : null;

    // lifts (drag, drop, hop) and the footprint decals
    let stepped = false;
    for (const entry of parts.values()) {
      const { lift } = entry;
      if (lift.y !== lift.target || lift.v !== 0) { step(lift, dt); stepped = true; }
      const { y } = lift;
      entry.built.group.position.y = y;
      if (entry.shadow) {
        entry.shadow.visible = true;
        entry.shadow.material.opacity = clamp(0.4 + y * 0.9, 0, 0.7);
        entry.shadow.scale.set(entry.base[0] * (1 + y * 0.5), 1, entry.base[1] * (1 + y * 0.5)); // blurs as it rises
      }
      if (entry.ring) {
        entry.ring.visible = Boolean(entry.selected);
        entry.ring.material.opacity = entry.selected ? 0.85 + 0.15 * Math.sin(t * 4) : 0;
      }
      if (entry.halo) {
        const lit = entry.level === 'yellow' || entry.level === 'red';
        entry.halo.visible = lit;
        if (lit) {
          entry.halo.material.color.setHex(entry.level === 'red' ? COLORS.danger : COLORS.warn);
          entry.halo.material.opacity = entry.level === 'red' ? 0.55 + 0.3 * Math.sin(t * 4.5) : 0.4 + 0.08 * Math.sin(t * 2);
        }
      }
      const st = sim?.parts?.[entry.id] ?? null;
      if (entry.simState !== st) { entry.simState = st; entry.built.setSim(st); }
      entry.built.update(t, dt);
    }
    if (stepped) syncWires(s.design, false); // wires follow the parts while they rise and fall

    // parts on their way out
    for (let i = leaving.length - 1; i >= 0; i--) {
      const entry = leaving[i];
      entry.leave = Math.min(1, entry.leave + dt / 0.2);
      entry.root.scale.setScalar(Math.max(0.001, 1 - entry.leave));
      if (entry.leave >= 1) {
        entry.root.removeFromParent();
        leaving.splice(i, 1);
      }
    }

    // wires: growth, flow and particles
    for (const [id, item] of wires) item.wire.update(dt, sim?.wires?.[id] ?? 0, Boolean(sim));

    // pointer hover (one pick per frame at most)
    if (pending && !drag) {
      const pick = pickAtCached(pending.x, pending.y);
      pending = null;
      const hover = state().hover;
      if (pick?.type === 'pin') {
        if (hover?.part !== pick.part || hover?.pin !== pick.pin) vm.setHover(pick.part, pick.pin);
      } else if (hover) vm.setHover(null);
      setHoverWire(pick?.type === 'wire' && !state().wiring ? pick.id : null);
    }

    updateElastic(t);

    // the mat glides to fit the parts
    const k = 1 - Math.exp(-6 * dt);
    let settling = false;
    for (const key of ['cx', 'cz', 'w', 'd']) {
      const diff = mat.goal[key] - mat[key];
      if (Math.abs(diff) > 0.005) { mat[key] += diff * k; settling = true; } else mat[key] = mat.goal[key];
    }
    if (settling) placeMat();

    // the enclosure: rebuild a moment after the design stops changing
    if (box) {
      if (boxDirtyAt !== null && !drag && performance.now() - boxDirtyAt > 160) {
        boxDirtyAt = null;
        const data = state().enclosure?.data;
        if (data?.ok) mountEnclosure(data);
      }
      box?.built.update(t, dt);
    }
  }

  // The dashed line from the chosen pin to the cursor (or to the pin under it)
  function updateElastic(t) {
    const s = state();
    const from = s.wiring && designPart(s.wiring.part);
    const start = from && pinWorld(from, s.wiring.pin);
    if (!start) { elastic.hide(); mark.visible = aim.visible = false; return; }
    let end = null;
    const over = s.hover && !(s.hover.part === s.wiring.part && s.hover.pin === s.wiring.pin) ? designPart(s.hover.part) : null;
    if (over) end = pinWorld(over, s.hover.pin);
    const onPin = Boolean(end);
    if (!end && cursor) {
      const ground = sceneView.groundPointAt(cursor.x, cursor.y);
      if (ground) end = { x: ground.x, y: 0.2, z: ground.z };
    }
    mark.visible = true;
    mark.position.set(start.x, start.y + 0.02, start.z);
    mark.scale.setScalar(1 + 0.25 * Math.sin(t * 6));
    if (!end) { elastic.hide(); aim.visible = false; return; }
    elastic.show(wireCurve(start, end, { segments: 24 }), t);
    aim.visible = onPin;
    aim.position.set(end.x, end.y + 0.02, end.z);
    aim.scale.setScalar(0.8 + 0.2 * Math.sin(t * 6 + 1));
  }

  // --- Input ---

  function pickAtCached(x, y) {
    if (pickCache && pickCache.x === x && pickCache.y === y) return pickCache.pick;
    const pick = targets.length ? (sceneView.pickAt(x, y, pinTargets) ?? sceneView.pickAt(x, y, targets)) : null;
    pickCache = { x, y, pick };
    return pick;
  }

  const grabber = {
    last: null,
    // only a press on a part's body drags it; pins and wires keep their own clicks
    hit(x, y) {
      if (!layer.visible) return false;
      return pickAtCached(x, y)?.type === 'part';
    },
    hover() {},
    start(x, y) {
      const pick = pickAtCached(x, y);
      const part = pick?.type === 'part' && designPart(pick.part);
      const ground = sceneView.groundPointAt(x, y);
      if (!part || !ground) return;
      drag = { id: part.id, dx: part.x - ground.x, dz: part.z - ground.z, x, y, moved: false, at: { x: part.x, z: part.z } };
      grabber.last = { x, y };
      vm.select(part.id);
    },
    move(x, y) {
      grabber.last = { x, y };
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(x - drag.x, y - drag.y) < DRAG_PX) return;
        drag.moved = true;
        const entry = parts.get(drag.id);
        if (entry) entry.lift.target = LIFT;
        vm.setHover(null);
      }
      const ground = sceneView.groundPointAt(x, y);
      if (!ground) return;
      const next = { x: clamp(snap(ground.x + drag.dx), -LIMIT, LIMIT), z: clamp(snap(ground.z + drag.dz), -LIMIT, LIMIT) };
      if (next.x === drag.at.x && next.z === drag.at.z) return;
      drag.at = next;
      vm.move(drag.id, next);
    },
    end() {
      if (!drag) return;
      const { id, moved } = drag;
      drag = null;
      const entry = parts.get(id);
      if (entry) entry.lift.target = 0;
      if (moved) vm.moveEnd(id);
    },
  };

  const picker = {
    targets,
    handle(pick) {
      if (pick.type === 'pin') vm.pickPin(pick.part, pick.pin);
      else if (pick.type === 'part') vm.select(pick.part);
      else if (pick.type === 'wire' && !state().wiring) vm.removeWire(pick.id);
    },
  };

  const onMove = (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse' && !e.buttons) pending = { x: e.clientX, y: e.clientY };
  };
  const onLeave = () => { pending = null; cursor = null; if (layer.visible) { if (state().hover) vm.setHover(null); setHoverWire(null); } };
  const onDown = (e) => { downAt = layer.visible && e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };
  // A click on the empty bench clears the selection
  const onUp = (e) => {
    const start = downAt;
    downAt = null;
    if (!start || !layer.visible || drag) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_PX) return;
    if (!pickAtCached(e.clientX, e.clientY) && state().selected) vm.select(null);
  };
  const onKey = (e) => {
    if (!layer.visible || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const id = state().selected;
    if (!id) return;
    if (e.key.toLowerCase() === 'r') { e.preventDefault(); vm.rotate(id); }
    else if (e.key === 'Delete') { e.preventDefault(); vm.remove(id); }
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);

  const unsubscribe = vm.store.subscribe(sync, { immediate: true });
  sceneView.onFrame(frame);

  return {
    grabber,
    picker,
    // already called every frame (once per frame, however many times it is called)
    update: frame,
    // flies the camera to the middle of the bench (call it when the lab view opens)
    frame() { cameraViewModel?.flyTo({ x: mat.goal.cx, z: mat.goal.cz }); },
    dispose() {
      unsubscribe();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      for (const { wire } of wires.values()) wire.dispose();
      unmountEnclosure();
    },
  };
}
