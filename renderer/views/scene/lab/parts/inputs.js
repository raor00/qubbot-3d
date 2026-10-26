// Inputs and power: push button, potentiometer and the 4 x AA battery holder. Millimetres, centred on the
// footprint (x across, z deep, y up).
import * as THREE from 'three';
import {
  K, mat, box, cyl, cylH, annulus, rod, group, pcb, smooth,
} from './kit.js';

export function button(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.2;
  pcb(body, 0x1c1d21, w, d, { t: T, r: 1.2 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  const z = -1.5;
  box(body, K.silver, 7.8, 0.8, 7.8, 0, T, z);
  box(body, K.black, 6.6, 2.6, 6.6, 0, T + 0.8, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(body, K.silver, 0.9, 0.5, 1.4, sx * 4.1, T, z + sz * 2.4);
  // Coloured cap that travels down when pressed
  const cap = group(body, 0, 0, z);
  const capColor = mat('btnCap', 0xd93b3b, { r: 0.3, m: 0.1 });
  cyl(cap, capColor, 3, 3.4, 0, T + 3.4, 0, 28);
  annulus(cap, mat('btnCapRim', 0xf06a6a, { r: 0.35, m: 0.1 }), 3, 2.1, 0, T + 6.82, 0, 28);
  const press = smooth(0, 26);
  let pressed = false;
  ctx.tick((_, dt) => {
    press.to = pressed ? 1 : 0;
    cap.position.y = -1.5 * press.step(dt);
  });
  return { sim: (s) => { pressed = !!s?.pressed; } };
}

export function potentiometer(ctx) {
  const { spec, body } = ctx;
  const [w, d] = spec.size;
  const T = 1.4;
  pcb(body, spec.color, w, d, { t: T, r: 1.2 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  const z = -2.4;
  cyl(body, K.silver, 6.4, 4.2, 0, T, z, 28);
  cyl(body, K.steel, 6.5, 0.4, 0, T + 4.2, z, 28);
  cyl(body, K.steel, 3.3, 3.4, 0, T + 4.6, z, 20);
  // Knob: black, fluted, with a white marker; it turns with percent
  const knob = group(body, 0, T + 7.4, z);
  const black = mat('knobBlack', 0x17181b, { r: 0.45, m: 0.25 });
  cyl(knob, black, 6.1, 10.8, 0, 0, 0, 32);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    box(knob, black, 1.1, 10.4, 1.3, Math.cos(a) * 6.2, 0.2, Math.sin(a) * 6.2, -a);
  }
  cyl(knob, mat('knobCap', 0x2a2c31, { r: 0.4, m: 0.4 }), 5.2, 0.5, 0, 10.8, 0, 28);
  box(knob, mat('knobMark', 0xf4f4ef, { r: 0.5, m: 0 }), 0.9, 0.2, 4.4, 0, 11.2, -2.2);
  const turn = smooth(0.5, 12);
  let percent = 50;
  ctx.tick((_, dt) => {
    turn.to = THREE.MathUtils.clamp(percent / 100, 0, 1);
    knob.rotation.y = -(turn.step(dt) - 0.5) * THREE.MathUtils.degToRad(270);
  });
  return { sim: (s) => { percent = s?.percent ?? 50; } };
}

export function battery(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const plastic = mat('holder', 0x1a1b1f, { r: 0.55, m: 0.1 });
  const zBack = -d / 2, zFront = 21;
  // Tray: floor, dividers, end walls
  box(body, plastic, w, 1.2, zFront - zBack, 0, 0, (zFront + zBack) / 2);
  for (let i = 0; i <= 4; i++) box(body, plastic, 1.2, 9.5, zFront - zBack, -w / 2 + 0.6 + i * (w - 1.2) / 4, 0, (zFront + zBack) / 2);
  box(body, plastic, w, 8, 2.4, 0, 0, zBack + 1.2);
  box(body, plastic, w, 8, 2.2, 0, 0, zFront - 1.1);
  // Four AA cells lying along z, alternating polarity
  const label = mat('cellBody', 0x2a2623, { r: 0.4, m: 0.35 });
  const band = mat('cellBand', 0xb8733a, { r: 0.35, m: 0.8 });
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 0.6 + (w - 1.2) / 8 + i * (w - 1.2) / 4;
    const y = 1.2 + 6.9;
    cylH(body, label, 6.9, 40, x, y, -3, 'z', 24);
    cylH(body, band, 6.95, 4, x, y, -3 + (i % 2 ? -18 : 18), 'z', 24);
    cylH(body, K.silver, 2.7, 1.4, x, y, i % 2 ? -23.3 : 17.3, 'z', 14);
    cylH(body, K.steel, 6.5, 0.8, x, y, i % 2 ? 17.2 : -23.2, 'z', 24);
    box(body, mat('cellMark', 0xe9e5d8, { r: 0.6, m: 0 }), 0.3, 0.12, 6, x - 0.0, y + 6.9, i % 2 ? 5 : -5);
  }
  // Terminal strip in front, with a red and a black lead to the pins
  const stripTop = 3;
  box(body, plastic, w, stripTop, 29 - zFront, 0, 0, (29 + zFront) / 2);
  ctx.pinOptions.housing = 'none';
  ctx.pinOptions.base = stripTop;
  for (const s of spots) {
    const red = s.pin === '+';
    rod(body, mat(red ? 'wireRedBat' : 'wireBlackBat', red ? 0xc0392b : 0x25272b, { r: 0.6, m: 0 }), [s.x, 6.5, zFront - 1.2], [s.x, s.y + 0.6, s.z], 0.8);
  }
  return {};
}
