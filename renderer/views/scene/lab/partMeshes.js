// The bench's 3D parts: buildPart(type) -> { group, pins, setLevel, setSelected, setHover, setSim, update, dispose }.
// Procedural, low-poly but detailed models drawn in millimetres (scaled by MM) with their origin at the centre
// of the footprint and y = 0 on the bench. Per-part models live in parts/ (the BUILDERS table below).
// Pins sit where labLayout.pinSpots puts them; the part carries userData.pick = { type: 'part' }, each pin
// userData.pick = { type: 'pin', pin } (the caller adds `part`). Only problems (red / amber) and what is
// "alive" in the simulation glow; everything else is matte.
import * as THREE from 'three';
import { componentOf } from '../../../models/componentCatalog.js';
import { MM, pinSpots } from '../../../viewmodels/labLayout.js';
import { PALETTE } from '../materials.js';
import { K, box, pinColor, smooth, unit } from './parts/kit.js';
import { arduinoUno, arduinoNano, esp32, pico } from './parts/boards.js';
import { hcSr04, pir, dht22, soil, ldr } from './parts/sensors.js';
import { servo, relay, buzzer, led, l298n } from './parts/actuators.js';
import { oled, lcd1602 } from './parts/displays.js';
import { button, potentiometer, battery } from './parts/inputs.js';

// One builder per catalog id. A builder draws into ctx.body (mm) and returns { sim(state|null) } or nothing.
const BUILDERS = {
  'arduino-uno': arduinoUno,
  'arduino-nano': arduinoNano,
  'esp32-devkit': esp32,
  pico,
  'hc-sr04': hcSr04,
  pir,
  dht22,
  soil,
  ldr,
  'servo-sg90': servo,
  relay,
  buzzer,
  led,
  l298n,
  'oled-128x64': oled,
  'lcd-1602-i2c': lcd1602,
  button,
  potentiometer,
  'battery-aa4': battery,
};

export const PART_TYPES = Object.keys(BUILDERS);

const LEVEL_COLORS = { red: PALETTE.danger, yellow: PALETTE.warn };
const HOVER = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: PALETTE.accent, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0 });

const pinMaterials = new Map();
const pinMaterial = (color) => {
  if (!pinMaterials.has(color)) pinMaterials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7 }));
  return pinMaterials.get(color);
};

// A rounded rectangle on a Shape / Path (x, z drawn as x, y: the geometry is laid flat afterwards)
function roundedRect(path, x0, z0, x1, z1, r) {
  path.moveTo(x0 + r, z0);
  path.lineTo(x1 - r, z0); path.quadraticCurveTo(x1, z0, x1, z0 + r);
  path.lineTo(x1, z1 - r); path.quadraticCurveTo(x1, z1, x1 - r, z1);
  path.lineTo(x0 + r, z1); path.quadraticCurveTo(x0, z1, x0, z1 - r);
  path.lineTo(x0, z0 + r); path.quadraticCurveTo(x0, z0, x0 + r, z0);
  return path;
}
const flatten = (geometry) => geometry.rotateX(Math.PI / 2);

// The ring of a rounded rectangle around the part, `width` thick, `margin` outside its footprint
function outlineGeometry(b, margin, width) {
  const shape = roundedRect(new THREE.Shape(), b.minX - margin, b.minZ - margin, b.maxX + margin, b.maxZ + margin, 0.3 + margin * 0.5);
  shape.holes.push(roundedRect(new THREE.Path(), b.minX - margin + width, b.minZ - margin + width, b.maxX + margin - width, b.maxZ + margin - width, 0.2 + margin * 0.4));
  return flatten(new THREE.ShapeGeometry(shape, 6));
}
function plateGeometry(b, margin) {
  return flatten(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), b.minX - margin, b.minZ - margin, b.maxX + margin, b.maxZ + margin, 0.3 + margin * 0.6), 6));
}

export function buildPart(type) {
  const spec = componentOf(type);
  const builder = BUILDERS[type];
  if (!spec || !builder) throw new Error(`buildPart: unknown part "${type}"`);

  const group = new THREE.Group();
  group.name = `part:${type}`;
  group.userData.pick = { type: 'part' };
  const body = new THREE.Group();
  body.name = 'body';
  body.scale.setScalar(MM);
  group.add(body);

  // What the builders see (millimetres)
  const owned = [];
  const ticks = [];
  const spots = pinSpots({ type, x: 0, z: 0, rot: 0 });
  const ctx = {
    spec, body,
    spots: spots.map((s) => ({ pin: s.pin, x: s.x / MM, y: s.y / MM, z: s.z / MM })),
    pinOptions: { housing: 'strips', base: 1.6, colors: {} },
    own: (resource) => { owned.push(resource); return resource; },
    tick: (fn) => ticks.push(fn),
  };
  const api = builder(ctx) ?? {};

  // --- Pins: sockets in the body, and a metal post + a coloured tip at each pin spot ---
  const opts = ctx.pinOptions;
  if (opts.housing !== 'none') {
    const top = Math.max(opts.base + 0.4, ctx.spots[0].y - 1.0);
    if (opts.housing === 'strips') {
      const rows = new Map();
      for (const s of ctx.spots) rows.set(Math.sign(s.z), [...(rows.get(Math.sign(s.z)) ?? []), s]);
      for (const row of rows.values()) {
        const xs = row.map((s) => s.x);
        const x0 = Math.min(...xs) - 1.4, x1 = Math.max(...xs) + 1.4;
        box(body, K.header, x1 - x0, top - opts.base, 2.6, (x0 + x1) / 2, opts.base, row[0].z);
      }
    } else {
      for (const s of ctx.spots) box(body, K.header, 2.5, top - opts.base, 2.5, s.x, opts.base, s.z);
    }
  }
  let nearest = Infinity;
  spots.forEach((a, i) => spots.forEach((b, j) => {
    const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (i !== j && dist > 1e-6) nearest = Math.min(nearest, dist);
  }));
  const hitR = Number.isFinite(nearest) ? THREE.MathUtils.clamp(nearest * 0.42, 0.05, 0.14) : 0.12;
  const tipR = Math.min(0.07, hitR * 0.78);
  const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const hitGeometry = new THREE.SphereGeometry(1, 10, 8);
  owned.push(hitMaterial, hitGeometry);

  const pins = new Map();
  const pinState = new Map();
  const catalogPins = new Map(spec.pins.map((p) => [p.id, p]));
  for (const spot of spots) {
    const pin = new THREE.Group();
    pin.name = `pin:${spot.pin}`;
    pin.position.set(spot.x, spot.y, spot.z);
    pin.userData.pick = { type: 'pin', pin: spot.pin };
    const color = opts.colors?.[spot.pin] ?? pinColor(catalogPins.get(spot.pin));
    const postH = spot.y - opts.base * MM;
    if (postH > 0.02) {
      const post = new THREE.Mesh(unit.cylinder(8), pinMaterial(0xcfd3d9));
      post.scale.set(0.06, postH, 0.06);
      post.position.y = -postH / 2;
      pin.add(post);
    }
    const tip = new THREE.Mesh(unit.sphere(12), pinMaterial(color));
    tip.scale.setScalar(tipR * 2);
    pin.add(tip);
    const hit = new THREE.Mesh(hitGeometry, hitMaterial);
    hit.scale.setScalar(hitR);
    pin.add(hit);
    group.add(pin);
    pins.set(spot.pin, pin);
    pinState.set(spot.pin, { tip, color, scale: smooth(1, 18) });
  }

  // --- Footprint of everything drawn (for the glow and the ring), in world units ---
  group.updateMatrixWorld(true);
  const full = new THREE.Box3();
  body.traverse((o) => { if (o.isMesh && !o.userData.noBounds) full.union(new THREE.Box3().setFromObject(o)); });
  const halfW = (spec.size[0] * MM) / 2, halfD = (spec.size[1] * MM) / 2;
  const bounds = {
    minX: Math.min(full.min.x, -halfW), maxX: Math.max(full.max.x, halfW),
    minZ: Math.min(full.min.z, -halfD), maxZ: Math.max(full.max.z, halfD),
  };

  // --- Level glow (red / amber) and selection ring: built the first time they are needed ---
  const glow = { color: null, level: null, intensity: smooth(0, 5), root: null, layers: [], outline: null };
  const select = { on: false, amount: smooth(0, 14), root: null, material: null };
  const flat = (geometry, material, y, order) => {
    owned.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.renderOrder = order;
    mesh.raycast = () => {};
    return mesh;
  };
  const additive = (opacity) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    owned.push(material);
    return material;
  };
  function ensureGlow() {
    if (glow.root) return;
    glow.root = new THREE.Group();
    glow.root.visible = false;
    // a soft halo on the bench (three nested plates), then a bright outline the bloom pass catches
    for (const [margin, opacity] of [[0.22, 0.3], [0.5, 0.16], [0.95, 0.08]]) {
      const layer = { material: additive(opacity), base: opacity };
      glow.layers.push(layer);
      glow.root.add(flat(plateGeometry(bounds, margin), layer.material, 0.02, 3));
    }
    glow.outline = { material: additive(1), base: 1 };
    glow.root.add(flat(outlineGeometry(bounds, 0.1, 0.06), glow.outline.material, 0.03, 4));
    group.add(glow.root);
  }
  function ensureSelect() {
    if (select.root) return;
    select.root = new THREE.Group();
    select.root.visible = false;
    select.material = new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    owned.push(select.material);
    select.root.add(flat(outlineGeometry(bounds, 0.34, 0.05), select.material, 0.045, 5));
    // four corner ticks reaching outward
    const tick = new THREE.BoxGeometry(0.34, 0.01, 0.05);
    owned.push(tick);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = new THREE.Mesh(tick, select.material), b = new THREE.Mesh(tick, select.material);
      a.position.set(sx > 0 ? bounds.maxX + 0.5 : bounds.minX - 0.5, 0.045, sz > 0 ? bounds.maxZ + 0.34 : bounds.minZ - 0.34);
      b.position.set(sx > 0 ? bounds.maxX + 0.34 : bounds.minX - 0.34, 0.045, sz > 0 ? bounds.maxZ + 0.5 : bounds.minZ - 0.5);
      b.rotation.y = Math.PI / 2;
      for (const m of [a, b]) { m.raycast = () => {}; select.root.add(m); }
    }
    group.add(select.root);
  }

  let disposed = false;
  const glowColor = new THREE.Color();
  api.sim?.(null);

  return {
    group, body, spec, pins, bounds,

    // 'red' | 'yellow' | 'green': a soft glow and outline on the bench; green shows nothing
    setLevel(level) {
      const color = LEVEL_COLORS[level] ?? null;
      glow.color = color;
      glow.level = level;
      if (color != null) {
        ensureGlow();
        glowColor.set(color);
        for (const { material } of [...glow.layers, glow.outline]) material.color.copy(glowColor);
        glow.outline.material.color.multiplyScalar(1.3);
        glow.root.visible = true;
      }
      glow.intensity.to = color != null ? 1 : 0;
    },

    // A neutral white ring around the part
    setSelected(on) {
      select.on = !!on;
      if (select.on) { ensureSelect(); select.root.visible = true; }
    },

    // Enlarges and lights the hovered pin; null clears it
    setHover(pinId) {
      const hovered = pinId && pins.has(pinId) ? pinId : null;
      for (const [id, state] of pinState) {
        const on = id === hovered;
        state.scale.to = on ? 2.3 : 1;
        state.tip.material = on ? HOVER : pinMaterial(state.color);
      }
    },

    // Per-kind state from simModel; null (or { dead: true }) is the part at rest
    setSim(state) {
      api.sim?.(state && !state.dead ? state : null);
    },

    update(t = 0, dt = 0) {
      if (disposed) return;
      for (const fn of ticks) fn(t, dt);
      for (const state of pinState.values()) state.tip.scale.setScalar(tipR * 2 * state.scale.step(dt));
      if (glow.root) {
        const k = glow.intensity.step(dt);
        if (k < 0.01 && glow.color == null) glow.root.visible = false;
        else {
          // red breathes, amber stays calm
          const pulse = glow.level === 'red' ? 0.72 + 0.28 * Math.sin(t * 3.2) : 0.9 + 0.1 * Math.sin(t * 1.6);
          for (const layer of glow.layers) layer.material.opacity = layer.base * k * pulse;
          glow.outline.material.opacity = k * (0.55 + 0.45 * pulse);
        }
      }
      if (select.root) {
        select.amount.to = select.on ? 1 : 0;
        const k = select.amount.step(dt);
        select.material.opacity = 0.95 * k;
        select.root.scale.setScalar(1 + (1 - k) * 0.02 + 0.006 * Math.sin(t * 3));
        if (k < 0.01 && !select.on) select.root.visible = false;
      }
    },

    // Frees what this part created (shared geometries and materials stay)
    dispose() {
      disposed = true;
      for (const resource of owned) resource.dispose?.();
      group.removeFromParent();
    },
  };
}
