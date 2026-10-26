// Displays: 0.96" OLED (128x64) and the 1602 LCD with its I2C backpack. The screens are canvas textures that
// show setSim({ lines }) and go dark at rest. Millimetres, centred on the footprint.
import {
  K, mat, box, cyl, pcb, silkRect, silkMarks, chip, sprinkles, screen,
} from './kit.js';

export function oled(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const T = 1.2;
  pcb(body, spec.color, w, d, { t: T, r: 1.2, holes: [[-w / 2 + 2.3, -d / 2 + 2.3], [w / 2 - 2.3, -d / 2 + 2.3]], holeR: 1.1 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 1, 6.6, w / 2 - 1, d / 2 - 1, T, 0.3);
  for (const s of spots) box(body, K.silk, 0.5, 0.14, 1.2, s.x, T - 0.02, s.z - 2.9);
  // Glass panel with a black border, a gold flex strip and the lit area
  const glassTop = T + 1.5;
  box(body, mat('oledGlass', 0x0a0b0e, { r: 0.12, m: 0.4 }), 25.8, 1.5, 17.6, 0, T, -4.4);
  box(body, mat('oledBezel', 0x15171c, { r: 0.2, m: 0.5 }), 24, 0.1, 15.4, 0, glassTop, -4.4);
  box(body, mat('oledFlex', 0xc27d28, { r: 0.5, m: 0.4 }), 13, 0.3, 3.6, 0, T, 5);
  const lit = screen(ctx, body, {
    w: 21.7, d: 10.9, x: 0, y: glassTop + 0.14, z: -3.2, cols: 16, rows: 2, px: 256, py: 128,
    fg: '#c9fbff', on: '#06151a', off: '#050607', glow: 7,
  });
  chip(body, -8, T, 7.2, 4, 3, 1, { leads: 'skirt' });
  sprinkles(body, T, [[-3, 7.6, 'x'], [1, 7.6, 'x'], [5, 7.6, 'x'], [9, 7.2, 'z', K.smdBlack]]);
  return { sim: (s) => lit.show(s?.lines ? [s.lines[0] ?? '', s.lines[1] ?? ''] : null) };
}

export function lcd1602(ctx) {
  const { spec, body, spots } = ctx;
  const [w, d] = spec.size;
  const T = 1.6;
  pcb(body, spec.color, w, d, { t: T, r: 1.4, holes: [[-w / 2 + 2.5, -d / 2 + 2.5], [w / 2 - 2.5, -d / 2 + 2.5]], holeR: 1.5 });
  ctx.pinOptions.housing = 'singles';
  ctx.pinOptions.base = T;

  silkRect(body, -w / 2 + 1, 9.3, w / 2 - 1, d / 2 - 1, T, 0.3);
  for (const s of spots) box(body, K.silk, 0.5, 0.14, 1.2, s.x, T - 0.02, s.z - 2.9);
  // Metal bezel with a dark window; the lit screen shows 16 x 2 characters on a green backlight
  const frameH = 8.6;
  box(body, mat('lcdBezel', 0xa6adb5, { r: 0.35, m: 0.8 }), 71.4, frameH, 24.4, 0, T, -3.8);
  box(body, mat('lcdTab', 0x8c939b, { r: 0.4, m: 0.8 }), 75.4, 0.5, 6, 0, T, -3.8);
  const top = T + frameH;
  box(body, mat('lcdGlass', 0x0d130f, { r: 0.15, m: 0.3 }), 66.6, 0.15, 17.6, 0, top, -3.8);
  const lit = screen(ctx, body, {
    w: 64.6, d: 14.6, x: 0, y: top + 0.2, z: -3.8, cols: 16, rows: 2, px: 512, py: 116,
    fg: '#12290f', on: '#a4e05a', off: '#1c2a16', cell: true, font: 'bold 34px ui-monospace, Menlo, Consolas, monospace',
  });
  // I2C backpack parts: expander chip, blue trimmer, jumper
  chip(body, 0, T, 12.2, 10, 3.9, 1.5, { leads: 'skirt' });
  box(body, mat('trimmerBlue', 0x2b73d9, { r: 0.5, m: 0.2 }), 9.4, 5.4, 4.6, -22, T, 11);
  cyl(body, K.gold, 1.6, 0.2, -22 - 2, T + 5.4, 11, 14);
  box(body, K.header, 5.4, 2.4, 2.6, 24, T, 12);
  box(body, mat('jumperBlue', 0x274fa6, { r: 0.6, m: 0 }), 3, 2.8, 2.4, 23, T, 12);
  sprinkles(body, T, [[-9, 12.5, 'x'], [9, 12.5, 'x'], [13.5, 11, 'z', K.smdBlack], [-13, 11, 'z']]);
  return { sim: (s) => lit.show(s?.lines ? [s.lines[0] ?? '', s.lines[1] ?? ''] : null) };
}
