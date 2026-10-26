// Sensors: HC-SR04, PIR, DHT22, soil probe and LDR module. Millimetres, centred on the footprint; pins sit on
// the near edge (+z) so every tall thing is kept toward the back.
import * as THREE from 'three';
import {
  K, mat, box, cyl, cylH, dome, annulus, disc, pcb, silkRect, silkMarks, chip, smd, sprinkles, crystal, statusLed, pulseRings, smooth,
} from './kit.js';

const SCRATCH = new THREE.Color();
const mixColor = (a, b, k) => SCRATCH.set(a).lerp(new THREE.Color(b), k);

export function hcSr04(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  const corners = [[-w / 2 + 2.2, -d / 2 + 2.2], [w / 2 - 2.2, -d / 2 + 2.2]];
  pcb(body, spec.color, w, d, { t: T, r: 1, holes: corners, holeR: 1.1 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 1.5, -d / 2 + 1.2, w / 2 - 1.5, d / 2 - 1.2, T, 0.3);
  silkMarks(body, -20, 5.4, 4, 13.3, T, { len: 3, th: 0.5 });
  // Two silver "eyes": a metal can, a dark mesh dish with rings, a centre dot
  for (const side of [-1, 1]) {
    const x = side * 12.5, z = -1.4;
    cyl(body, K.silver, 8, 12.4, x, T, z, 36);
    cyl(body, K.steel, 8.15, 0.5, x, T + 11.2, z, 36);
    cyl(body, mat('mesh', 0x202328, { r: 0.7, m: 0.5 }), 6.5, 0.2, x, T + 12.3, z, 32);
    annulus(body, K.silver, 5.2, 4.7, x, T + 12.55, z, 32);
    annulus(body, K.steel, 3.3, 2.9, x, T + 12.55, z, 28);
    disc(body, K.silver, 1.2, x, T + 12.56, z, 12);
  }
  crystal(body, 0, T, -6.6, 8, 1.6);
  chip(body, 0, T, 0.6, 9, 4, 1.4, { leads: 'skirt' });
  chip(body, 0, T, -2.8, 4.4, 2.6, 1.1, { leads: 'skirt' });
  sprinkles(body, T, [[-4.5, 3, 'x'], [4.5, 3, 'x'], [-3.4, -4.4, 'z'], [3.4, -4.4, 'z'], [0, 4, 'x', K.smdBlack]]);

  // Sonar waves rising from both eyes while it measures
  const waves = [-1, 1].map((side) => pulseRings(ctx, body, { x: side * 12.5, y: T + 13, z: -1.4, r0: 5, r1: 13, rise: 22, color: 0x9fe8ff, count: 2, period: 1.3, opacity: 0.5 }));
  return { sim: (s) => waves.forEach((wave) => wave.set(!!s)) };
}

export function pir(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 1.2, holes: [[-w / 2 + 2, -d / 2 + 2], [w / 2 - 2, -d / 2 + 2]], holeR: 1.1 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 1.2, -d / 2 + 1, w / 2 - 1.2, d / 2 - 1, T, 0.3);
  // White bezel + faceted fresnel dome
  cyl(body, K.white, 11.5, 1.4, 0, T, -3.2, 28);
  const lens = mat('fresnel', 0xf7f7f2, { r: 0.35, m: 0, flat: true });
  const domeMesh = dome(body, ctx.own(lens.clone()), 10, 12, 0, T + 1.4, -3.2, 10, 4);
  const lensMat = domeMesh.material;
  lensMat.emissive = new THREE.Color(0xffe3a0);
  lensMat.emissiveIntensity = 0;
  // trimmers (orange, blue), a chip and a jumper
  cyl(body, mat('trimOrange', 0xe58a2b, { r: 0.5, m: 0.2 }), 2.2, 3.4, -11.2, T, 8.2, 16);
  cyl(body, mat('trimBlue', 0x2b73d9, { r: 0.5, m: 0.2 }), 2.2, 3.4, 11.2, T, 8.2, 16);
  box(body, K.black, 1, 0.3, 0.5, -11.2, T + 3.4, 8.2);
  chip(body, 0, T, 7.2, 8, 3.4, 1.3, { leads: 'skirt' });
  box(body, K.header, 5.2, 2.4, 2.6, 0, T, -10.4);
  sprinkles(body, T, [[-6.5, 8, 'x'], [6.5, 8, 'x'], [-8, -9.5, 'z'], [8, -9.5, 'z', K.smdBlack]]);
  const pulse = smooth(0, 8);
  let detected = false;
  ctx.tick((t, dt) => {
    pulse.to = detected ? 0.55 + 0.35 * Math.sin(t * 7) : 0;
    lensMat.emissiveIntensity = pulse.step(dt);
  });
  return { sim: (s) => { detected = !!s?.detected; } };
}

export function dht22(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.2;
  pcb(body, 0x1f5fbf, w, d, { t: T, r: 0.8 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  // White sensor body with a grille of dark slots on top and a rounded front
  box(body, K.white, w, 6.8, d - 4.6, 0, T, -2.3);
  for (let i = 0; i < 9; i++) box(body, mat('grille', 0x2a2d33, { r: 0.8, m: 0 }), 0.7, 0.2, d - 7.6, -9.6 + i * 2.4, T + 6.75, -2.3);
  // a recessed label strip on the front
  box(body, mat('dhtFace', 0xd9d9d2, { r: 0.6, m: 0 }), w - 6, 4.6, 0.3, 0, T + 1, d / 2 - 4.6 + 0.0);
  // tiny status LED that blinks when it reads
  const led = statusLed(ctx, body, 9.5, T, 3.6, 0x4aa8ff, { w: 1.4, d: 0.8, h: 0.5 });
  let alive = false;
  ctx.tick((t) => led.set(alive && t % 2 < 0.18));
  return { sim: (s) => { alive = !!s; } };
}

export function soil(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  // Electronics module on the left, two long tines to the right
  pcb(body, spec.color, 19, d, { t: T, r: 1, x: -w / 2 + 9.5 });
  const tineMat = ctx.own(mat('tine', 0x1c1c1f, { r: 0.5, m: 0.2 }).clone());
  const traceMat = ctx.own(mat('trace', 0xd9b24c, { r: 0.3, m: 0.9 }).clone());
  const tines = [[-6.2], [6.2]];
  tines.forEach(([z]) => {
    box(body, tineMat, w - 18, T, 7.4, 9.4, 0, z);
    box(body, traceMat, w - 21, 0.2, 2.2, 9.6, T, z);
    // pointed tip
    box(body, tineMat, 3.2, T, 3.6, w / 2 - 1.5, 0, z, Math.PI / 4);
  });
  box(body, tineMat, 10, T, d - 0.4, -w / 2 + 20.5, 0, 0);
  // module: comparator chip, blue trimmer, header block, LEDs
  chip(body, -26, T, 0, 5, 4, 1.4, { leads: 'skirt' });
  box(body, mat('trimmerBlue', 0x2b73d9, { r: 0.5, m: 0.2 }), 7, 4.4, 7, -21.5, T, -5);
  cyl(body, K.gold, 1.8, 0.2, -21.5, T + 4.4, -5, 14);
  box(body, K.black, 1.2, 0.15, 0.4, -21.5, T + 4.62, -5);
  sprinkles(body, T, [[-17, 2, 'x'], [-17, -2, 'x'], [-27, 7.6, 'x'], [-23, 7.6, 'x', K.smdBlack]]);
  const power = statusLed(ctx, body, -26.5, T, -6.5, 0x3ddc97, { w: 1.4, d: 0.8 });
  const wet = statusLed(ctx, body, -24, T, -6.5, 0xff4a4a, { w: 1.4, d: 0.8 });
  const moisture = smooth(0, 4);
  let percent = 0, alive = false;
  ctx.tick((_, dt) => {
    power.set(alive);
    wet.set(alive && percent > 55);
    moisture.to = alive ? Math.max(0, Math.min(1, percent / 100)) : 0;
    const k = moisture.step(dt);
    traceMat.color.copy(mixColor(0xd9b24c, 0x39d3c0, k));
    traceMat.emissive.copy(mixColor(0x000000, 0x39d3c0, k));
    traceMat.emissiveIntensity = 0.7 * k;
  });
  return { sim: (s) => { alive = !!s; percent = s?.percent ?? 0; } };
}

export function ldr(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 1, holes: [[-w / 2 + 2, -d / 2 + 2], [w / 2 - 2, -d / 2 + 2]], holeR: 1.1 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 1.2, -d / 2 + 1, w / 2 - 1.2, d / 2 - 1, T, 0.3);
  // The photocell: a tan disc with a zigzag track, on two legs
  const faceMat = ctx.own(mat('ldrFace', 0xb9894a, { r: 0.5, m: 0.1 }).clone());
  cyl(body, K.black, 3.2, 1, -7, T, -1.2, 20);
  cyl(body, faceMat, 2.8, 0.3, -7, T + 1, -1.2, 20);
  const track = mat('ldrTrack', 0x3a2a14, { r: 0.7, m: 0 });
  for (let i = 0; i < 5; i++) box(body, track, 4.4 - Math.abs(i - 2) * 0.9, 0.12, 0.45, -7, T + 1.3, -2.8 + i * 0.8);
  cyl(body, K.silver, 0.25, 2.2, -8.4, T, 2.4, 6);
  cyl(body, K.silver, 0.25, 2.2, -5.6, T, 2.4, 6);
  // trimmer, comparator, LEDs
  box(body, mat('trimmerBlue', 0x2b73d9, { r: 0.5, m: 0.2 }), 6.6, 4.2, 6.6, 6, T, -1.5);
  cyl(body, K.gold, 1.7, 0.2, 6, T + 4.2, -1.5, 14);
  chip(body, 1.6, T, -3.4, 5, 3.4, 1.3, { leads: 'skirt' });
  sprinkles(body, T, [[11, 2.5, 'x'], [11, -4.5, 'x'], [-1, 2.3, 'x', K.smdBlack]]);
  const power = statusLed(ctx, body, 11.5, T, -1.6, 0x3ddc97, { w: 1.4, d: 0.8 });
  const out = statusLed(ctx, body, 12.5, T, 0.4, 0xff4a4a, { w: 1.4, d: 0.8 });
  const light = smooth(0, 5);
  let percent = 0, alive = false;
  ctx.tick((_, dt) => {
    power.set(alive);
    out.set(alive && percent > 50);
    light.to = alive ? Math.max(0, Math.min(1, percent / 100)) : 0;
    const k = light.step(dt);
    faceMat.color.copy(mixColor(0x8a6535, 0xffd78a, k));
    faceMat.emissive.set(0xffb347);
    faceMat.emissiveIntensity = 0.85 * k;
  });
  return { sim: (s) => { alive = !!s; percent = s?.percent ?? 0; } };
}
