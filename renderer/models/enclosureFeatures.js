// What each part needs from its printed enclosure: openings for plugs, eyes, windows and air.
// Data only (the geometry lives in enclosureModel.js). All numbers are millimetres.
//
// Frame of a feature: the part seen from above with rot = 0, drawn like its datasheet:
//   - `at` / `along` are measured from the part's corner, y UP the drawing (the same frame as `holes` in
//     componentCatalog.js): x runs along the width, y runs along the depth toward the far edge (-z on the bench)
//   - `side` is the edge a port or the eyes face: 'left' (-x), 'right' (+x), 'top' (far, -z), 'bottom' (near, +z)
//   - `offset: [dx, dz]` on lid features is from the part's center, in bench axes (dz > 0 is the near side)
//
// Kinds:
//   port    rectangular opening on a wall:   { side, along, w, h, lift }   lift = height of its floor above the
//           board's underside (the PCB is 1.6 mm); side 'auto' = the wall nearest to the part
//   eyes    two round holes on the wall the part faces: { side, pitch, r, cy }   cy = height of their center above
//           the part's base
//   window  rectangular opening on the lid: { offset, w, d }
//   hole    round opening on the lid: { offset, r }
//   vents   slots on the lid: { offset, count, w, d, pitch }   w across, d along the bench's z axis (before turning)
// Adding a part's mount is adding a row here; a part with no row simply sits in the box.

const usbB = { kind: 'port', label: 'usb', side: 'left', w: 12, h: 11, lift: 1.6 };
const microUsb = { kind: 'port', label: 'usb', side: 'left', w: 8, h: 4, lift: 1.6 };

export const FEATURES = {
  // Boards: their cable comes out through a wall
  'arduino-uno': [
    { ...usbB, along: 38.1 },
    { kind: 'port', label: 'jack', side: 'left', along: 8.5, w: 9, h: 11, lift: 1.6 },
    { kind: 'vents', label: 'vents', offset: [8, 0], count: 4, w: 2, d: 14, pitch: 5 },
  ],
  'arduino-nano': [{ ...microUsb, along: 9, w: 9, h: 4 }],
  'esp32-devkit': [
    { ...microUsb, along: 14 },
    { kind: 'vents', label: 'vents', offset: [0, 0], count: 3, w: 2, d: 12, pitch: 5 },
  ],
  pico: [{ ...microUsb, along: 10.5 }],

  // Sensors: eyes and domes look out; the rest breathes or sees light
  'hc-sr04': [{ kind: 'eyes', label: 'eyes', side: 'top', pitch: 26, r: 8, cy: 8.5 }],
  pir: [{ kind: 'hole', label: 'dome', offset: [0, 0], r: 11 }],
  dht22: [{ kind: 'vents', label: 'vents', offset: [0, 0], count: 3, w: 1.6, d: 10, pitch: 3.2 }],
  ldr: [{ kind: 'hole', label: 'light', offset: [0, 0], r: 4 }],

  // Actuators
  'servo-sg90': [{ kind: 'hole', label: 'shaft', offset: [-5, 0], r: 5 }],
  relay: [{ kind: 'vents', label: 'vents', offset: [0, 0], count: 4, w: 2, d: 16, pitch: 5 }],
  buzzer: [{ kind: 'vents', label: 'sound', offset: [0, 0], count: 3, w: 1.5, d: 6, pitch: 3 }],
  led: [{ kind: 'hole', label: 'led', offset: [0, 0], r: 3.2 }],
  l298n: [{ kind: 'vents', label: 'vents', offset: [0, 0], count: 5, w: 2, d: 20, pitch: 5 }],

  // Displays: a window on the lid over the visible area
  'oled-128x64': [{ kind: 'window', label: 'screen', offset: [0, -2], w: 24, d: 14 }],
  'lcd-1602-i2c': [{ kind: 'window', label: 'screen', offset: [0, -2], w: 66, d: 18 }],

  // Inputs
  button: [{ kind: 'hole', label: 'cap', offset: [0, 0], r: 6.2 }],
  potentiometer: [{ kind: 'hole', label: 'knob', offset: [0, 0], r: 4 }],

  // Power: the cable leaves through the nearest wall
  'battery-aa4': [{ kind: 'port', label: 'cable', side: 'auto', along: 0, w: 6, h: 6, lift: 2 }],
};

export function featuresOf(type) {
  return FEATURES[type] ?? [];
}
