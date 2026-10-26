// Where things are on the lab's bench (world units: 1 = 10 mm, y up). Pure: the 3D view draws from it and
// the tests check it. A part lies flat at (x, z), turned rot quarter turns; its pins are header pins on
// its edges: a board has power and analog on the near edge (+z) and the rest on the far edge (-z), a part
// has all of them in one row on its near edge, in catalog order.
import { componentOf } from '../models/componentCatalog.js';

export const MM = 0.1;
const PIN_INSET = 0.25; // from the edge, so the pin sits on the board
const PIN_HEIGHT = 0.12;

const nearEdge = (pin) => pin.kinds?.some((k) => ['5v', '3v3', 'vin', 'gnd', 'analog'].includes(k)) && !pin.kinds.includes('pwm');

// Footprint of a part on the ground: center, width (x) and depth (z) after turning, and height
export function partBox(part) {
  const spec = componentOf(part.type);
  const [w, d, h] = spec.size.map((v) => v * MM);
  const turned = part.rot % 2 === 1;
  return { x: part.x, z: part.z, w: turned ? d : w, d: turned ? w : d, h, rot: part.rot };
}

// Turns a local point (x across, z deep, centered on the part) by rot quarter turns
function turn(x, z, rot) {
  for (let i = 0; i < rot; i++) [x, z] = [-z, x];
  return [x, z];
}

// [{ pin, x, y, z }] in world units
export function pinSpots(part) {
  const spec = componentOf(part.type);
  if (!spec) return [];
  const [w, d, h] = spec.size.map((v) => v * MM);
  const rows = spec.kind === 'board'
    ? [spec.pins.filter(nearEdge), spec.pins.filter((p) => !nearEdge(p))]
    : [spec.pins, []];
  const top = Math.min(h, 0.3) + PIN_HEIGHT;
  return rows.flatMap((row, r) => row.map((pin, i) => {
    const span = w - PIN_INSET * 2;
    const lx = row.length === 1 ? 0 : -span / 2 + (span * i) / (row.length - 1);
    const lz = (r === 0 ? 1 : -1) * (d / 2 - PIN_INSET);
    const [x, z] = turn(lx, lz, part.rot);
    return { pin: pin.id, x: part.x + x, y: top, z: part.z + z };
  }));
}

export function pinSpot(part, pinId) {
  return pinSpots(part).find((s) => s.pin === pinId) ?? null;
}

// A free spot near (x, z) for a new part: steps to the right until it does not overlap anything
export function freeSpot(design, type, x = 0, z = 0) {
  const spec = componentOf(type);
  if (!spec) return { x, z };
  const probe = (px) => partBox({ type, x: px, z, rot: 0 });
  const overlaps = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 0.6 && Math.abs(a.z - b.z) * 2 < a.d + b.d + 0.6;
  let px = x;
  for (let i = 0; i < 40 && design.parts.some((p) => overlaps(probe(px), partBox(p))); i++) px += 2;
  return { x: Math.round(px * 2) / 2, z: Math.round(z * 2) / 2 };
}

// What a wire carries, for its color: 'power' | 'gnd' | 'bus' | 'signal'
export function wireKind(design, wire) {
  const kinds = [wire.from, wire.to].flatMap((end) => {
    const part = design.parts.find((p) => p.id === end.part);
    const pin = componentOf(part?.type)?.pins.find((p) => p.id === end.pin);
    return pin?.kinds ?? pin?.accepts ?? [];
  });
  if (kinds.includes('gnd')) return 'gnd';
  if (kinds.some((k) => ['5v', '3v3', 'vin'].includes(k))) return 'power';
  if (kinds.some((k) => k === 'sda' || k === 'scl')) return 'bus';
  return 'signal';
}
