// The four boards: Arduino Uno, Nano, ESP32 DevKit and Raspberry Pi Pico. Millimetres, centred on the footprint.
// Near edge = +z (power and analog), far edge = -z (digital), as labLayout.pinSpots puts the pins.
import {
  K, mat, box, cyl, cylH, pcb, holesOf, silkRect, silkLine, silkMarks, silkLogo, chip, smd, sprinkles, elCap, crystal, usbPort,
  statusLed,
} from './kit.js';

// Holes that do not land on a pin (the ideal pin rows of the bench ignore the real hole positions)
function freeHoles(holes, spots, clearance = 3.8) {
  return holes.filter(([hx, hz]) => spots.every((s) => Math.hypot(s.x - hx, s.z - hz) > clearance));
}

// A tactile switch lying on the board: a dark housing with a round cap
function tact(parent, x, y, z, size = 6, h = 3.4, cap = 0x2b2b2e) {
  box(parent, K.silver, size, 0.8, size, x, y, z);
  box(parent, K.black, size - 0.8, h - 0.8, size - 0.8, x, y + 0.8, z);
  cyl(parent, mat(`tact${cap}`, cap, { r: 0.4, m: 0.2 }), size * 0.27, 0.9, x, y + h, z, 16);
}

// 2x3 ICSP header: a black block with six gold pin tops
function icsp(parent, x, y, z) {
  box(parent, K.header, 4.4, 2.4, 6.9, x, y, z);
  for (const dx of [-1.27, 1.27]) for (const dz of [-2.54, 0, 2.54]) cyl(parent, K.gold, 0.35, 0.8, x + dx, y + 2.4, z + dz, 8);
}

function pinSilk(parent, spots, y, toward = 2.9) {
  for (const s of spots) box(parent, K.silk, 0.5, 0.14, 1.2, s.x, y - 0.02, s.z + (s.z > 0 ? -toward : toward));
}

export function arduinoUno(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 2, holes: freeHoles(holesOf(spec), spots) });
  ctx.pinOptions.housing = 'strips';
  ctx.pinOptions.base = T;

  // Silkscreen: header outlines, labels, logo
  silkRect(body, -33.6, -22.7, 33.6, -25.8, T);
  silkRect(body, -33.6, 22.7, 33.6, 25.8, T);
  pinSilk(body, spots, T);
  silkLogo(body, -2, -14, T);
  silkMarks(body, 4.5, -10.5, 4, 2, T, { len: 1.2 });
  silkRect(body, 3, 11.5, 14, 17.5, T, 0.3);

  // USB-B (top left), DC jack (bottom left)
  usbPort(body, -31.6, T, -11, { dir: -1, len: 16.4, w: 12, h: 10.9, mouthW: 8.6, mouthH: 7.4 });
  box(body, K.black, 14, 11, 9, -28.4, T, 12.5);
  cylH(body, K.hole, 3.2, 0.6, -35.5, T + 5.6, 12.5, 'x', 18);
  cylH(body, K.silver, 0.8, 1.2, -35.2, T + 5.6, 12.5, 'x', 8);

  // Main chip in its socket, USB chip, crystal, regulator, caps, reset, ICSP, sprinkles
  box(body, K.header, 36.4, 2.6, 9.2, 8, T, 5);
  chip(body, 8, T + 2.6, 5, 34.5, 7.6, 3.6, { leads: 'dip', n: 14, dot: true });
  silkMarks(body, -4, 5, 3, 3.5, T + 6.3, { len: 1, th: 0.5 });
  chip(body, -17, T, -8.5, 5.4, 5.4, 1, { leads: 'quad' });
  crystal(body, -7, T, 14.5, 11, 2.2);
  box(body, K.black, 6.8, 1.6, 3.6, -19.5, T, 20.5);
  box(body, K.silver, 5, 0.3, 2.2, -19.5, T + 1.6, 20.5);
  elCap(body, -19.5, T, 9.5, 3.2, 6.4, 0x16181c);
  elCap(body, -12.5, T, 9.5, 3.2, 6.4, 0x1c3b8c);
  tact(body, -23.5, T, -1, 6, 3.6, 0xb33a3a);
  icsp(body, 29.5, T, 1);
  icsp(body, -8.5, T, -13);
  sprinkles(body, T, [[-12, -4.5, 'z'], [-14.2, -4.5, 'z'], [-2, -7, 'x'], [-2, -5, 'x'], [14, 17, 'x'], [17, 17, 'x'], [20, 17, 'x'], [24, 15, 'z'], [24, 12, 'z', K.smdBlack], [-3.5, -16, 'x', K.smdBlack]]);
  box(body, K.smdBlack, 1.2, 0.9, 2.2, 2.5, T, 14.5);

  // Status LEDs: TX, RX, L, ON
  const tx = statusLed(ctx, body, 14, T, -17.4, 0xffb347);
  const rx = statusLed(ctx, body, 16.4, T, -17.4, 0xffb347);
  const l = statusLed(ctx, body, 18.8, T, -17.4, 0xffb347);
  const on = statusLed(ctx, body, 21.2, T, -17.4, 0x3ddc97);
  let running = false;
  ctx.tick((t) => {
    on.set(running);
    l.set(running && t % 1 < 0.5);
    tx.set(running && Math.sin(t * 31) * Math.sin(t * 7.3) > 0.55);
    rx.set(running && Math.sin(t * 23 + 1) * Math.sin(t * 5.1) > 0.6);
  });
  return { sim: (s) => { running = !!s?.running; } };
}

export function arduinoNano(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const T = 1.4;
  pcb(body, spec.color, w, d, { t: T, r: 1 });
  ctx.pinOptions.housing = 'strips';
  ctx.pinOptions.base = T;

  silkRect(body, -21.6, -3.8, 21.6, 3.8, T, 0.3);
  pinSilk(body, spots, T, 2.6);
  silkLogo(body, 13, 0, T, 1.5);
  usbPort(body, -20.2, T, 0, { dir: -1, len: 7.6, w: 7.8, h: 3.9, mouthW: 5.8, mouthH: 2.3 });
  chip(body, 5, T, 0, 7, 7, 1.1, { leads: 'quad' });
  chip(body, -10.5, T, 0, 9, 3.9, 1.4, { leads: 'skirt' });
  box(body, K.silver, 3.4, 0.9, 2.6, -2.5, T, 3.2);
  tact(body, 14.5, T, -3, 3.6, 2.2, 0x2b2b2e);
  sprinkles(body, T, [[-5.5, -2.6, 'x'], [-5.5, 2.6, 'x'], [-15, 2.5, 'z'], [-15, -2.5, 'z'], [11, 3.4, 'x', K.smdBlack], [1, -4.2, 'x']]);
  const pwr = statusLed(ctx, body, 18, T, 2.8, 0x3ddc97, { w: 1.4, d: 0.8 });
  const l = statusLed(ctx, body, 18, T, 0.4, 0xffb347, { w: 1.4, d: 0.8 });
  let running = false;
  ctx.tick((t) => { pwr.set(running); l.set(running && t % 1 < 0.5); });
  return { sim: (s) => { running = !!s?.running; } };
}

export function esp32(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 1.5 });
  ctx.pinOptions.housing = 'strips';
  ctx.pinOptions.base = T;

  pinSilk(body, spots, T);
  silkRect(body, -26.4, -9, -13, 9, T, 0.3);
  usbPort(body, -24.8, T, 0, { dir: -1, len: 7.4, w: 8, h: 2.9, mouthW: 6.4, mouthH: 1.7 });
  chip(body, -17, T, 0, 5, 5, 0.9, { leads: 'quad' });
  tact(body, -12.5, T, -6.4, 4.2, 2.6, 0x2b2b2e);
  tact(body, -12.5, T, 6.4, 4.2, 2.6, 0x2b2b2e);
  sprinkles(body, T, [[-20, 5, 'x'], [-20, -5, 'x'], [-14, 2.3, 'z'], [-14, -2.3, 'z'], [-21.5, 2.6, 'x', K.smdBlack]]);

  // The WROOM module: black PCB, metal RF can, gold meander antenna
  const P = 0.7;
  box(body, mat('moduleBoard', 0x0d0e11, { r: 0.35, m: 0.3 }), 27.5, P, 18.4, 12, T, 0);
  box(body, K.silver, 17, 3.1, 15, 6.2, T + P, 0);
  box(body, K.steel, 17.2, 0.25, 15.2, 6.2, T + P + 2.7, 0);
  for (let i = 0; i < 3; i++) box(body, K.dark, 9 - i * 2, 0.15, 0.6, 6.2, T + P + 3.1, -3 + i * 3);
  box(body, K.dark, 4, 0.15, 4, -0.5, T + P + 3.1, 5, 0);
  const metal = mat('antenna', 0xd6a93c, { r: 0.3, m: 0.9 });
  for (let i = 0; i < 5; i++) {
    box(body, metal, 0.7, 0.18, 11.4, 17.8 + i * 1.7, T + P, 0);
    if (i < 4) box(body, metal, 1.7, 0.18, 0.7, 18.65 + i * 1.7, T + P, i % 2 ? -5.35 : 5.35);
  }
  box(body, metal, 3, 0.18, 0.7, 16.3, T + P, 5.35);
  const power = statusLed(ctx, body, -8.5, T, -4.5, 0xff4a4a, { w: 1.4, d: 0.8 });
  const user = statusLed(ctx, body, -8.5, T, 4.5, 0x4aa8ff, { w: 1.4, d: 0.8 });
  let running = false;
  ctx.tick((t) => { power.set(running); user.set(running && t % 1.4 < 0.7); });
  return { sim: (s) => { running = !!s?.running; } };
}

export function pico(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const T = 1.4;
  pcb(body, spec.color, w, d, { t: T, r: 1.2 });
  ctx.pinOptions.housing = 'strips';
  ctx.pinOptions.base = T;

  // Castellated half-holes (gold pads) at every pin of the edge, silk in white
  const pad = mat('castle', 0xe0be5a, { r: 0.3, m: 0.9 });
  for (const s of spots) box(body, pad, 1.0, 0.16, 1.5, s.x, T - 0.02, s.z > 0 ? d / 2 - 0.9 : -d / 2 + 0.9);
  pinSilk(body, spots, T, 2.6);
  silkRect(body, -17, -5, 18.5, 5, T, 0.3);
  silkMarks(body, 4, 7.3, 5, 1.8, T, { len: 1.1, th: 0.4 });
  usbPort(body, -22.6, T, 0, { dir: -1, len: 7.2, w: 7.8, h: 2.9, mouthW: 6.2, mouthH: 1.7 });
  // RP2040: a dark square with a light dot, flash chip, crystal, BOOTSEL
  chip(body, 3.5, T, 0, 7, 7, 0.9, { leads: 'quad', body: mat('rp2040', 0x101216, { r: 0.35, m: 0.3 }) });
  cyl(body, K.silver, 0.5, 0.05, 3.5, T + 0.9, 0, 10);
  chip(body, 12.5, T, -0.5, 5.2, 4.2, 1.1, { leads: 'skirt' });
  box(body, K.silver, 3.4, 0.9, 2.6, 9.5, T, 3.6);
  box(body, K.white, 4, 0.9, 3.6, -14.2, T, 0);
  box(body, K.silver, 3.3, 1.4, 2.8, -14.2, T + 0.9, 0);
  sprinkles(body, T, [[-9, 3.5, 'x'], [-9, -3.5, 'x'], [8, -3.5, 'x'], [17, 3.5, 'x', K.smdBlack], [17, -3.5, 'x']]);
  const led = statusLed(ctx, body, -9.5, T, -2.2, 0x3ddc97, { w: 1.4, d: 0.8 });
  let running = false;
  ctx.tick((t) => led.set(running && t % 1.2 < 0.6));
  return { sim: (s) => { running = !!s?.running; } };
}
