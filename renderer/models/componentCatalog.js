// The lab's parts (docs/features/laboratorio/README.md): boards, sensors, actuators, displays and power.
// Data only. Names and one-line descriptions live in es.js (lab.parts.<id>); here are the facts the
// checker and the 3D bench need:
//   kind:     'board' | 'part'
//   category: CATEGORIES key (the catalog's sections)
//   size:     [width, depth, height] in millimetres (the bench draws 1 unit = 10 mm; the enclosure uses it)
//   color:    the PCB or body color on the bench
//   pins:     a board's pins: { id, kinds } where kinds are the signals it offers (PIN_KINDS)
//             a part's pins:  { id, accepts, required? } where accepts are the board kinds it may go to
//   volts:    a part's supply: [min, max] volts it accepts on its power pin
//   mA:       what a part draws at most (the 5 V budget); a board's `budgetMa` is what it can give
//   logic:    a board's signal voltage (3.3 or 5); a part with `out5v` sends 5 V back on a signal pin
//   source:   where its measurements come from, with the license (only open ones: see docs)
// Adding a part is adding a row here, its strings in es.js and, when it has one, its printable mount.

export const CATEGORIES = ['boards', 'sensors', 'actuators', 'displays', 'inputs', 'power'];

// What a board pin can be used for
export const PIN_KINDS = ['5v', '3v3', 'vin', 'gnd', 'digital', 'pwm', 'analog', 'sda', 'scl'];

const range = (prefix, from, to, kinds) => Array.from({ length: to - from + 1 }, (_, i) => ({ id: `${prefix}${from + i}`, kinds }));
const PWM_UNO = new Set([3, 5, 6, 9, 10, 11]);
const unoDigital = () => Array.from({ length: 12 }, (_, i) => i + 2).map((n) => ({ id: `D${n}`, kinds: PWM_UNO.has(n) ? ['digital', 'pwm'] : ['digital'] }));
const unoAnalog = () => [
  ...range('A', 0, 3, ['analog', 'digital']),
  { id: 'A4', kinds: ['analog', 'digital', 'sda'] },
  { id: 'A5', kinds: ['analog', 'digital', 'scl'] },
];
const POWER = [{ id: '5V', kinds: ['5v'] }, { id: '3V3', kinds: ['3v3'] }, { id: 'GND', kinds: ['gnd'] }, { id: 'VIN', kinds: ['vin'] }];

const SIGNAL = ['digital', 'pwm', 'analog'];
const power = (volts) => ({ id: 'VCC', accepts: volts[0] > 3.6 ? ['5v'] : volts[1] < 4 ? ['3v3'] : ['5v', '3v3'], required: true });
const GND = { id: 'GND', accepts: ['gnd'], required: true };

const ADAFRUIT = { name: 'Adafruit CAD Parts', license: 'MIT', url: 'https://github.com/adafruit/Adafruit_CAD_Parts' };
const ARDUINO = { name: 'Arduino docs', license: 'CC BY-SA 4.0', url: 'https://docs.arduino.cc' };
const KICAD = { name: 'kicad-lib-arduino', license: 'CC0', url: 'https://github.com/g200kg/kicad-lib-arduino' };
const DATASHEET = { name: 'Hoja de datos del fabricante', license: 'medidas públicas', url: '' };

export const COMPONENTS = [
  // --- Boards ---
  { id: 'arduino-uno', kind: 'board', category: 'boards', size: [68.6, 53.4, 15], color: 0x1f6fa8, logic: 5, budgetMa: 500,
    pins: [...POWER, ...unoDigital(), ...unoAnalog()], holes: [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]], source: KICAD },
  { id: 'arduino-nano', kind: 'board', category: 'boards', size: [45, 18, 8], color: 0x1f6fa8, logic: 5, budgetMa: 500,
    pins: [...POWER, ...unoDigital(), ...unoAnalog(), ...range('A', 6, 7, ['analog'])], holes: [[1.8, 1.8], [43.2, 1.8], [1.8, 16.2], [43.2, 16.2]], source: ARDUINO },
  { id: 'esp32-devkit', kind: 'board', category: 'boards', size: [55, 28, 10], color: 0x1d1d1f, logic: 3.3, budgetMa: 500,
    pins: [
      { id: '5V', kinds: ['5v'] }, { id: '3V3', kinds: ['3v3'] }, { id: 'GND', kinds: ['gnd'] },
      ...[2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 23, 25, 26, 27].map((n) => ({ id: `GPIO${n}`, kinds: [12, 13, 14, 15, 2, 4, 25, 26, 27].includes(n) ? ['digital', 'pwm', 'analog'] : ['digital', 'pwm'] })),
      { id: 'GPIO21', kinds: ['digital', 'pwm', 'sda'] }, { id: 'GPIO22', kinds: ['digital', 'pwm', 'scl'] },
      ...[32, 33, 34, 35, 36, 39].map((n) => ({ id: `GPIO${n}`, kinds: n >= 34 ? ['analog'] : ['digital', 'pwm', 'analog'] })),
    ], holes: [[2.5, 2.5], [52.5, 2.5], [2.5, 25.5], [52.5, 25.5]], source: ADAFRUIT },
  { id: 'pico', kind: 'board', category: 'boards', size: [51, 21, 4], color: 0x2e7d32, logic: 3.3, budgetMa: 300,
    pins: [
      { id: 'VBUS', kinds: ['5v'] }, { id: '3V3', kinds: ['3v3'] }, { id: 'GND', kinds: ['gnd'] },
      ...range('GP', 2, 3, ['digital', 'pwm']), { id: 'GP4', kinds: ['digital', 'pwm', 'sda'] }, { id: 'GP5', kinds: ['digital', 'pwm', 'scl'] },
      ...range('GP', 6, 22, ['digital', 'pwm']), ...range('GP', 26, 28, ['digital', 'pwm', 'analog']),
    ], holes: [[2, 4.8], [49, 4.8], [2, 16.2], [49, 16.2]], source: ADAFRUIT },

  // --- Sensors ---
  { id: 'hc-sr04', kind: 'part', category: 'sensors', size: [45, 20, 15], color: 0x1f5fbf, volts: [4.5, 5.5], mA: 15, out5v: true,
    pins: [power([4.5, 5.5]), { id: 'TRIG', accepts: ['digital'], required: true }, { id: 'ECHO', accepts: ['digital'], required: true }, GND], source: DATASHEET },
  { id: 'pir', kind: 'part', category: 'sensors', size: [32, 24, 25], color: 0x2a7a3a, volts: [4.5, 12], mA: 1,
    pins: [power([4.5, 12]), { id: 'OUT', accepts: ['digital'], required: true }, GND], source: DATASHEET },
  { id: 'dht22', kind: 'part', category: 'sensors', size: [25, 15, 8], color: 0xe8e8e8, volts: [3.3, 6], mA: 2,
    pins: [power([3.3, 6]), { id: 'DATA', accepts: ['digital'], required: true }, GND], source: ADAFRUIT },
  { id: 'soil', kind: 'part', category: 'sensors', size: [60, 20, 2], color: 0x1f6fa8, volts: [3.3, 5], mA: 5,
    pins: [power([3.3, 5]), { id: 'AOUT', accepts: ['analog'], required: true }, GND], source: DATASHEET },
  { id: 'ldr', kind: 'part', category: 'sensors', size: [30, 14, 6], color: 0x1f5fbf, volts: [3.3, 5], mA: 1,
    pins: [power([3.3, 5]), { id: 'AOUT', accepts: ['analog'], required: true }, GND], source: DATASHEET },

  // --- Actuators ---
  { id: 'servo-sg90', kind: 'part', category: 'actuators', size: [23, 12.2, 29], color: 0x2b5bd7, volts: [4.8, 6], mA: 250,
    pins: [power([4.8, 6]), { id: 'SIG', accepts: ['pwm'], required: true }, GND], source: ADAFRUIT },
  { id: 'relay', kind: 'part', category: 'actuators', size: [50, 26, 18], color: 0x1f5fbf, volts: [4.5, 5.5], mA: 70,
    pins: [power([4.5, 5.5]), { id: 'IN', accepts: ['digital'], required: true }, GND], source: DATASHEET },
  { id: 'buzzer', kind: 'part', category: 'actuators', size: [12, 12, 9], color: 0x1d1d1f, volts: [3.3, 5], mA: 30,
    pins: [{ id: 'SIG', accepts: ['digital', 'pwm'], required: true }, GND], source: DATASHEET },
  { id: 'led', kind: 'part', category: 'actuators', size: [5, 5, 9], color: 0xd93b3b, volts: [2, 5], mA: 20,
    pins: [{ id: 'SIG', accepts: ['digital', 'pwm'], required: true }, GND], source: DATASHEET },
  { id: 'l298n', kind: 'part', category: 'actuators', size: [43, 43, 27], color: 0xc62828, volts: [4.5, 5.5], mA: 40,
    pins: [{ id: '5V', accepts: ['5v'], required: true }, { id: 'ENA', accepts: ['pwm'], required: true }, { id: 'IN1', accepts: ['digital'], required: true }, { id: 'IN2', accepts: ['digital'], required: true }, GND], source: DATASHEET },

  // --- Displays ---
  { id: 'oled-128x64', kind: 'part', category: 'displays', size: [27, 27, 4], color: 0x1d1d1f, volts: [3.3, 5], mA: 20,
    pins: [power([3.3, 5]), { id: 'SDA', accepts: ['sda'], required: true }, { id: 'SCL', accepts: ['scl'], required: true }, GND], bus: 'i2c', source: ADAFRUIT },
  { id: 'lcd-1602-i2c', kind: 'part', category: 'displays', size: [80, 36, 12], color: 0x2e7d32, volts: [4.5, 5.5], mA: 30,
    pins: [power([4.5, 5.5]), { id: 'SDA', accepts: ['sda'], required: true }, { id: 'SCL', accepts: ['scl'], required: true }, GND], bus: 'i2c', source: DATASHEET },

  // --- Inputs ---
  { id: 'button', kind: 'part', category: 'inputs', size: [12, 12, 8], color: 0x1d1d1f, volts: [0, 5], mA: 0,
    pins: [{ id: 'SIG', accepts: ['digital'], required: true }, GND], source: DATASHEET },
  { id: 'potentiometer', kind: 'part', category: 'inputs', size: [17, 17, 20], color: 0x2b5bd7, volts: [3.3, 5], mA: 1,
    pins: [power([3.3, 5]), { id: 'OUT', accepts: ['analog'], required: true }, GND], source: DATASHEET },

  // --- Power ---
  { id: 'battery-aa4', kind: 'part', category: 'power', size: [62, 58, 15], color: 0x1d1d1f, supplies: 6, mA: 0,
    pins: [{ id: '+', accepts: ['vin'], required: true }, { id: '-', accepts: ['gnd'], required: true }], source: DATASHEET },
];

const BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]));

export function componentOf(id) {
  return BY_ID.get(id) ?? null;
}

// The catalog by section, in order: [{ category, items: [component] }], only sections with something
export function catalogSections(query = '', nameOf = (c) => c.id) {
  const q = query.trim().toLowerCase();
  const match = (c) => !q || c.id.includes(q) || nameOf(c).toLowerCase().includes(q);
  return CATEGORIES.map((category) => ({ category, items: COMPONENTS.filter((c) => c.category === category && match(c)) })).filter((s) => s.items.length);
}
