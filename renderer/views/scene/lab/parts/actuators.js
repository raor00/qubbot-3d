// Actuators: SG90 servo, relay module, buzzer, 5 mm LED and the L298N motor driver. Millimetres, centred on
// the footprint (x across, z deep, y up).
import * as THREE from 'three';
import {
  K, mat, box, cyl, cylH, dome, sphere, disc, annulus, rod, group, pcb, silkRect, silkMarks, chip, sprinkles, elCap, statusLed, pulseRings,
  smooth,
} from './kit.js';

// --- SG90 servo: blue body, mounting ears, white horn that follows setSim({ angle }) ---
export function servo(ctx) {
  const { spec, body, spots } = ctx;
  const z0 = -3.4; // body centre: the pins stand just in front of its face
  const blue = mat('servoBlue', spec.color, { r: 0.42, m: 0.1 });
  const darkBlue = mat('servoBlueDark', 0x20449e, { r: 0.5, m: 0.1 });
  const white = mat('servoWhite', 0xf4f4ef, { r: 0.4, m: 0 });
  const shaftX = 5.65;

  box(body, blue, 22.5, 16, 12.2, 0, 0, z0);
  box(body, darkBlue, 22.7, 0.4, 12.4, 0, 3.4, z0); // seam
  box(body, blue, 32.2, 2.5, 12.2, 0, 16, z0); // ears
  for (const x of [-14, 14]) {
    annulus(body, K.steel, 1.6, 0.9, x, 18.55, z0, 16);
    disc(body, K.hole, 0.9, x, 18.56, z0, 12);
  }
  box(body, blue, 22.5, 2.2, 12.2, 0, 18.5, z0);
  cyl(body, blue, 5.9, 2, shaftX, 20.7, z0, 28);
  cyl(body, darkBlue, 2.7, 1.7, -1.2, 20.7, z0, 18);
  // sticker on the front face
  box(body, mat('servoLabel', 0xe9e9e1, { r: 0.7, m: 0 }), 12.6, 6.8, 0.2, -3, 7.6, z0 + 6.1);
  box(body, mat('servoLabelInk', 0x2b3a6b, { r: 0.8, m: 0 }), 8, 0.9, 0.12, -3, 11.4, z0 + 6.22);
  box(body, mat('servoLabelInk', 0x2b3a6b, { r: 0.8, m: 0 }), 5, 0.9, 0.12, -5.2, 9.4, z0 + 6.22);

  // Lead wires: red (+), orange (signal), brown (ground), from the face to each pin
  const wireColor = { VCC: 0xd9534f, SIG: 0xf0922b, GND: 0x6b4a2f };
  for (const s of spots) {
    const id = s.pin;
    rod(body, mat(`servoWire${id}`, wireColor[id] ?? 0x888888, { r: 0.6, m: 0 }), [s.x, s.y, z0 + 6.0], [s.x, s.y, s.z], 0.55);
  }
  ctx.pinOptions.housing = 'none';
  ctx.pinOptions.base = spots[0]?.y ?? 4.2;
  ctx.pinOptions.colors = wireColor;

  // Horn: shaft, hub, tapered arm with holes, screw. Pivots on the shaft; angle 0 -> +x, 90 -> toward the front
  const horn = group(body, shaftX, 0, z0);
  cyl(horn, white, 2.5, 3.4, 0, 22.7, 0, 16);
  cyl(horn, white, 3.7, 2.2, 0, 26, 0, 22);
  cyl(horn, K.steel, 1.1, 0.7, 0, 28.2, 0, 10);
  box(horn, white, 14.5, 1.7, 3.6, 9.4, 26, 0);
  cyl(horn, white, 1.9, 1.7, 16.7, 26, 0, 14);
  for (const x of [6, 9, 12, 15.2]) cyl(horn, K.hole, 0.5, 0.2, x, 27.65, 0, 8);
  const angle = smooth(90, 9);
  let target = 90;
  ctx.tick((_, dt) => {
    angle.to = target;
    horn.rotation.y = -THREE.MathUtils.degToRad(angle.step(dt));
  });
  horn.rotation.y = -Math.PI / 2;
  return { sim: (s) => { target = THREE.MathUtils.clamp(s?.angle ?? 90, 0, 180); } };
}

// --- Relay module: blue board, big blue cube, screw terminals and two LEDs ---
export function relay(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 1.4, holes: [[-w / 2 + 2.5, -d / 2 + 2.5]], holeR: 1.5 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 6, -d / 2 + 1.2, w / 2 - 1.2, d / 2 - 1.2, T, 0.3);
  // The relay: a blue cube with white print
  const cube = mat('relayCube', 0x2e86e8, { r: 0.35, m: 0.05 });
  box(body, cube, 19.2, 15.4, 15.6, -10, T, -2.4);
  box(body, mat('relayInk', 0xf2f6ff, { r: 0.7, m: 0 }), 11, 0.12, 0.7, -10, T + 15.4, -4.4);
  box(body, mat('relayInk', 0xf2f6ff, { r: 0.7, m: 0 }), 8, 0.12, 0.7, -10, T + 15.4, -2.4);
  box(body, mat('relayInk', 0xf2f6ff, { r: 0.7, m: 0 }), 12, 0.12, 0.7, -10, T + 15.4, -0.4);
  // Screw terminals (3 positions) on the far edge
  const tx = 15.4, tz = -8.2;
  box(body, K.blueTerm, 15.8, 10, 8, tx, T, tz);
  for (let i = -1; i <= 1; i++) {
    const x = tx + i * 5.1;
    cyl(body, K.silver, 1.9, 0.5, x, T + 10, tz + 0.2, 16);
    box(body, K.dark, 3, 0.15, 0.5, x, T + 10.5, tz + 0.2, Math.PI / 4);
    box(body, K.black, 3.6, 4.4, 0.3, x, T + 1.8, tz + 4.0); // wire mouths
    box(body, K.black, 3.6, 4.4, 0.3, x, T + 1.8, tz - 4.0);
  }
  chip(body, 5.5, T, 3, 6.4, 4.8, 3.3, { leads: 'dip', n: 2 });
  box(body, K.black, 3.2, 4.2, 1.6, 12, T, 3.2); // transistor
  cylH(body, K.black, 1.1, 4, 18.6, T + 1.1, 3.6, 'x', 10);
  box(body, K.header, 7.6, 2.4, 2.6, 17, T, 7.6);
  box(body, mat('jumperBlue', 0x274fa6, { r: 0.6, m: 0 }), 5.2, 2.8, 2.4, 15.9, T, 7.6);
  sprinkles(body, T, [[2, 8, 'x'], [-2, 8, 'x'], [8.6, 7.2, 'z'], [22, 3, 'x', K.smdBlack], [22, 0, 'x']]);
  silkMarks(body, tx - 5.1, tz + 5.3, 3, 5.1, T, { len: 2.2, th: 0.5 });
  const power = statusLed(ctx, body, 21, T, 6.4, 0x3ddc97, { w: 2.2, d: 1.3, h: 0.9 });
  const active = statusLed(ctx, body, 21, T, 8.8, 0xff4a4a, { w: 2.2, d: 1.3, h: 0.9 });
  let alive = false, on = false;
  ctx.tick(() => { power.set(alive); active.set(alive && on); });
  return { sim: (s) => { alive = !!s; on = !!s?.on; } };
}

// --- Buzzer: black can on a small board, with sound rings when it sounds ---
export function buzzer(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.2;
  pcb(body, 0x1d5a34, w, d, { t: T, r: 1.4 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  const can = group(body, 0, 0, -1.6);
  cyl(can, mat('buzzerBlack', 0x131417, { r: 0.4, m: 0.2 }), 5.1, 7.8, 0, T, 0, 32);
  cyl(can, mat('buzzerRim', 0x23252a, { r: 0.5, m: 0.2 }), 5.1, 0.4, 0, T + 7.8, 0, 32);
  disc(can, K.hole, 0.9, 0, T + 8.25, 0, 12);
  box(can, mat('buzzerMark', 0xe0b84a, { r: 0.6, m: 0.1 }), 2.2, 0.1, 0.5, -3.1, T + 8.22, -2);
  box(can, mat('buzzerMark', 0xe0b84a, { r: 0.6, m: 0.1 }), 0.5, 0.1, 2.2, -3.1, T + 8.22, -2);
  const waves = pulseRings(ctx, can, { x: 0, y: T + 8.4, z: 0, r0: 3, r1: 9, rise: 12, color: 0xffd68a, count: 3, period: 0.9, opacity: 0.45 });
  let on = false;
  ctx.tick((t) => {
    can.position.x = on ? Math.sin(t * 120) * 0.12 : 0;
    can.position.y = on ? Math.sin(t * 97) * 0.08 : 0;
  });
  return { sim: (s) => { on = !!s?.on; waves.set(on); } };
}

// --- 5 mm LED: translucent dome that glows (emissive, the bloom pass catches it) ---
export function led(ctx) {
  const { spec, body, spots } = ctx;
  ctx.pinOptions.housing = 'none';
  ctx.pinOptions.base = spots[0]?.y ?? 4.2; // both pins sit inside the dome
  const color = spec.color;
  const shell = ctx.own(new THREE.MeshStandardMaterial({
    color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.8, emissive: color, emissiveIntensity: 0.03,
  }));
  const haloMat = ctx.own(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  for (const x of [-1.27, 1.27]) cyl(body, K.silver, 0.28, 3, x, 0, 0, 6);
  cyl(body, shell, 2.55, 0.9, 0, 2.3, 0, 28);
  cyl(body, shell, 2.25, 3.4, 0, 3.2, 0, 28);
  dome(body, shell, 2.25, 2.5, 0, 6.6, 0, 28, 8);
  box(body, K.steel, 0.3, 2.6, 2.2, -1.1, 3.3, 0); // inner post and anvil
  box(body, K.steel, 0.3, 1.6, 1.4, 1.1, 3.3, 0);
  const halo = sphere(body, haloMat, 6.5, 0, 6, 0, 18);
  halo.raycast = () => {};
  halo.userData.noBounds = true;
  const level = smooth(0, 14);
  const lit = new THREE.Color();
  let on = false;
  ctx.tick((_, dt) => {
    level.to = on ? 1 : 0;
    const k = level.step(dt);
    shell.emissiveIntensity = 0.03 + k * 3;
    shell.opacity = 0.8 + k * 0.2;
    shell.color.set(color).lerp(lit.set(0xffffff), k * 0.35);
    haloMat.opacity = k * 0.2;
    halo.visible = k > 0.01;
    halo.scale.setScalar(13 * (0.85 + 0.15 * k));
  });
  halo.visible = false;
  return { sim: (s) => { on = !!s?.on; } };
}

// --- L298N motor driver: red board, big black heatsink, blue screw terminals ---
export function l298n(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 1.6, holes: [[-w / 2 + 2.6, -d / 2 + 2.6], [w / 2 - 2.6, -d / 2 + 2.6]], holeR: 1.5 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 6, -d / 2 + 1.2, w / 2 - 6, 14, T, 0.3);
  // Heatsink: base plate and nine tall fins
  const sink = mat('heatsink', 0x23262b, { r: 0.45, m: 0.65 });
  box(body, sink, 21.6, 3, 14.6, 0, T, -3);
  for (let i = 0; i < 9; i++) box(body, sink, 1.2, 27 - T - 3, 14.6, -9.6 + i * 2.4, T + 3, -3);
  // The chip's bent leads in front of it
  for (let i = 0; i < 15; i++) box(body, K.silver, 0.5, 0.5, 4.2, -8.4 + i * 1.2, T + 0.2, 6.2);
  // Terminals: two on the far edge, three on the right side
  const terminal = (x, z, n, alongZ = false) => {
    const long = n * 5.1;
    box(body, K.blueTerm, alongZ ? 8.4 : long, 10, alongZ ? long : 8.4, x, T, z);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 5.1;
      const sx = alongZ ? x : x + o, sz = alongZ ? z + o : z;
      cyl(body, K.silver, 1.9, 0.5, sx, T + 10, sz, 16);
      box(body, K.dark, 3, 0.15, 0.5, sx, T + 10.5, sz, Math.PI / 4);
    }
  };
  terminal(-12.5, -16, 2);
  terminal(12.5, -16, 2);
  terminal(17.4, 3, 3, true);
  // regulator, big cap, diodes, jumpers
  box(body, K.black, 10, 9.5, 4.4, -16, T, -5.5);
  box(body, K.silver, 10, 8, 0.8, -16, T + 0.8, -8);
  elCap(body, -16.5, T, 8, 3.6, 8.4, 0x1c3b8c);
  for (let i = 0; i < 5; i++) for (const z of [11, 14]) {
    cylH(body, K.black, 1.1, 4.4, -9 + i * 4.5, T + 1.1, z, 'x', 10);
    box(body, K.silver, 0.5, 2.3, 2.3, -9 + i * 4.5 + 1.6, T + 0.0, z - 1.15);
  }
  box(body, K.header, 5.2, 2.4, 2.6, -17.5, T, 17.2);
  box(body, mat('jumperYellow', 0xe6c13c, { r: 0.6, m: 0 }), 2.6, 2.8, 2.4, -16.5, T, 17.2);
  sprinkles(body, T, [[-3, 10, 'x', K.smdBlack], [4, 9, 'x'], [8, 9, 'x']]);
  const power = statusLed(ctx, body, 10, T, 9, 0xff4a4a, { w: 2, d: 1.2, h: 0.8 });
  const a = statusLed(ctx, body, 5, T, 16.5, 0xffb347, { w: 1.6, d: 1.1, h: 0.7 });
  const b = statusLed(ctx, body, 2, T, 16.5, 0xffb347, { w: 1.6, d: 1.1, h: 0.7 });
  let alive = false, speed = 0;
  ctx.tick((t) => { power.set(alive); a.set(alive && speed > 0); b.set(alive && speed > 0 && t % 1.6 > 0.8); });
  return { sim: (s) => { alive = !!s; speed = s?.speed ?? 0; } };
}
