// A printable enclosure generated from the circuit: pure geometry, no DOM, no three.js, no dependencies.
//
//   enclosureFor(design, opts?) -> { ok, reason?, size, inner, solids, cutouts, standoffs, printMinutes, grams, ... }
//   toStl(enclosure, group?, { assembled? }) -> ArrayBuffer   (binary STL, ready for a slicer)
//   toScad(enclosure) -> string                              (the same box as parametric OpenSCAD)
//
// Frame (mm): x = world x * 10, z = world z * 10, y up from the underside of the box. Walls with openings are
// several boxes around each opening (no CSG): every solid is a closed box or cylinder, and neighbours touch
// without overlapping, so the STL is clean. Round openings are stepped (stair-cased) rectangles.
//
// solids: [{ kind: 'box', min, max, group, tag } | { kind: 'cylinder', center, r, rInner?, h, segments, group, tag }]
//   - group: 'base' | 'lid'
//   - tag: 'floor' | 'north' | 'south' | 'east' | 'west' | 'standoff' | 'plate' | 'lip' (north = -z, south = +z)
//   - cylinder: `center` = [x, y of the BOTTOM face, z]; rInner makes it a ring (M3 standoff)
// cutouts (documentation of every opening, also what toScad subtracts):
//   { id, part, label, wall: 'north'|'south'|'east'|'west'|'lid', shape: 'rect', min, max }
//   { id, part, label, wall, shape: 'round', center, r, axis: 'x'|'y'|'z', len }
import { componentOf } from './componentCatalog.js';
import { partBox, MM } from '../viewmodels/labLayout.js';
import { featuresOf } from './enclosureFeatures.js';

export const DEFAULTS = {
  wall: 2,         // wall thickness
  floor: 2,        // floor thickness
  lid: 2,          // lid plate thickness
  clearance: 2,    // free space around every part (and above the tallest)
  standoff: 4,     // height of the M3 standoffs under a board
  lipHeight: 2,    // how far the lid's inner lip goes into the box
  lipThickness: 1.5,
  lipGap: 0.2,     // play between the lip and the wall so the lid fits after printing
};
export const STANDOFF = { r: 3, rInner: 1.6, segments: 24 }; // M3: 6 mm post, 3.2 mm hole
const PCB = 1.6;          // typical board thickness
const PORT_PLAY = 1;      // an opening is 1 mm bigger than the plug
const REACH = 25;         // farther than this from its wall, a port uses the nearest wall instead
const DISC_STEPS = 12;    // stair steps of a round opening
const EPS = 1e-6;

const r3 = (v) => Math.round(v * 1000) / 1000;
const WALLS = ['north', 'south', 'east', 'west'];

function settings(opts = {}) {
  const pick = (key, min) => {
    const v = Number(opts[key]);
    return Number.isFinite(v) ? Math.max(min, v) : DEFAULTS[key];
  };
  return {
    wall: pick('wall', 1), floor: pick('floor', 1), lid: pick('lid', 1), clearance: pick('clearance', 0.5),
    standoff: pick('standoff', 1), lipHeight: pick('lipHeight', 0.5), lipThickness: pick('lipThickness', 0.5), lipGap: pick('lipGap', 0),
  };
}

// --- Triangles ---------------------------------------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Unit normal of a triangle (counter-clockwise seen from outside); [0,0,0] when degenerate
export function triangleNormal(a, b, c) {
  const n = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(n[0], n[1], n[2]);
  return len > 0 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 0, 0];
}

const quad = (out, a, b, c, d) => out.push([a, b, c], [a, c, d]);

// 12 triangles, outward normals
function boxTriangles(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const out = [];
  quad(out, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]); // +x
  quad(out, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]); // -x
  quad(out, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]); // +y
  quad(out, [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]); // -y
  quad(out, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]); // +z
  quad(out, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]); // -z
  return out;
}

// A cylinder (or a ring when rInner > 0) standing on y: 4n triangles, 8n for a ring
function cylinderTriangles({ center, r, rInner = 0, h, segments }) {
  const [cx, y0, cz] = center;
  const y1 = y0 + h;
  const n = Math.max(3, Math.round(segments));
  const ring = (radius, y) => Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
  });
  const ob = ring(r, y0), ot = ring(r, y1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    quad(out, ob[i], ot[i], ot[j], ob[j]); // outer wall
  }
  if (rInner > 0) {
    const ib = ring(rInner, y0), it = ring(rInner, y1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(out, ib[i], ib[j], it[j], it[i]);  // inner wall, facing the axis
      quad(out, ot[i], it[i], it[j], ot[j]);  // top ring
      quad(out, ob[i], ob[j], ib[j], ib[i]);  // bottom ring
    }
  } else {
    const top = [cx, y1, cz], bottom = [cx, y0, cz];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push([top, ot[j], ot[i]], [bottom, ob[i], ob[j]]);
    }
  }
  return out;
}

// [[a, b, c], ...] of one solid, each vertex [x, y, z]
export function solidTriangles(solid) {
  return solid.kind === 'cylinder' ? cylinderTriangles(solid) : boxTriangles(solid.min, solid.max);
}

export function boxVolume(min, max) {
  return (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
}

export function solidVolume(solid) {
  if (solid.kind === 'cylinder') {
    // the inscribed polygon, exactly what the triangles enclose
    const area = (rad) => 0.5 * solid.segments * rad * rad * Math.sin((2 * Math.PI) / solid.segments);
    return (area(solid.r) - (solid.rInner ? area(solid.rInner) : 0)) * solid.h;
  }
  return boxVolume(solid.min, solid.max);
}

// --- Walls with openings, without CSG ------------------------------------------------------------------------

// Cuts the rectangular `holes` ({ a0, a1, b0, b1 } in the two axes `axes` = [ia, ib] of the box face) out of the
// box and returns the boxes that remain: a grid made from the box and hole edges, empty cells dropped, runs merged.
function carve(min, max, axes, holes) {
  const [ia, ib] = axes;
  const lines = (i, key0, key1) => {
    const set = new Set([min[i], max[i]]);
    for (const h of holes) {
      for (const v of [h[key0], h[key1]]) if (v > min[i] + EPS && v < max[i] - EPS) set.add(r3(v));
    }
    return [...set].sort((p, q) => p - q);
  };
  const A = lines(ia, 'a0', 'a1'), B = lines(ib, 'b0', 'b1');
  const covered = (i, j) => {
    const ca = (A[i] + A[i + 1]) / 2, cb = (B[j] + B[j + 1]) / 2;
    return holes.some((h) => ca > h.a0 && ca < h.a1 && cb > h.b0 && cb < h.b1);
  };
  const out = [];
  let open = new Map(); // "i0-i1" -> { i0, i1, j0 }: runs still growing upward
  const flush = (keep) => {
    for (const [key, run] of open) if (!keep.has(key)) out.push(run);
    open = new Map([...open].filter(([key]) => keep.has(key)));
  };
  for (let j = 0; j < B.length - 1; j++) {
    const runs = [];
    for (let i = 0; i < A.length - 1; i++) {
      if (covered(i, j)) continue;
      const last = runs[runs.length - 1];
      if (last && last.i1 === i) last.i1 = i + 1;
      else runs.push({ i0: i, i1: i + 1 });
    }
    const keep = new Set(runs.map((r) => `${r.i0}-${r.i1}`));
    flush(keep);
    for (const r of runs) {
      const key = `${r.i0}-${r.i1}`;
      if (open.has(key)) open.get(key).j1 = j + 1;
      else open.set(key, { ...r, j0: j, j1: j + 1 });
    }
  }
  flush(new Set());
  return out.map((r) => {
    const lo = [...min], hi = [...max];
    lo[ia] = A[r.i0]; hi[ia] = A[r.i1];
    lo[ib] = B[r.j0]; hi[ib] = B[r.j1];
    return { min: lo, max: hi };
  });
}

// A disc as stair-stepped rectangles (area-equivalent): strips across b, each as wide as the circle at its middle
function discRects(ca, cb, r) {
  const rects = [];
  const step = (2 * r) / DISC_STEPS;
  for (let k = 0; k < DISC_STEPS; k++) {
    const b0 = cb - r + k * step, b1 = b0 + step;
    const mid = (b0 + b1) / 2 - cb;
    const half = Math.sqrt(Math.max(0, r * r - mid * mid));
    rects.push({ a0: r3(ca - half), a1: r3(ca + half), b0: r3(b0), b1: r3(b1) });
  }
  return rects;
}

// --- The enclosure ------------------------------------------------------------------------------------------

// Turns a local point (x across, z deep, centered on the part) by rot quarter turns, like labLayout does
function turn(x, z, rot) {
  for (let i = 0; i < rot; i++) [x, z] = [-z, x];
  return [x, z];
}

const SIDE_DIR = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

// The wall a local direction points at once the part is turned
function wallFacing(dir, rot) {
  const [dx, dz] = turn(dir[0], dir[1], rot);
  if (Math.abs(dx) > Math.abs(dz)) return dx < 0 ? 'west' : 'east';
  return dz < 0 ? 'north' : 'south';
}

export function enclosureFor(design, opts = {}) {
  const none = { ok: false, reason: 'noBoard', size: { w: 0, d: 0, h: 0 }, solids: [], cutouts: [], standoffs: 0, printMinutes: 0, grams: 0 };
  const parts = (design?.parts ?? []).filter((p) => componentOf(p.type));
  if (!parts.some((p) => componentOf(p.type).kind === 'board')) return none;
  const cfg = settings(opts);

  // Every part's footprint in mm, and how high its underside sits (boards go on standoffs)
  const items = parts.map((part) => {
    const spec = componentOf(part.type);
    const box = partBox(part);
    const w = r3(box.w / MM), d = r3(box.d / MM), cx = r3(part.x / MM), cz = r3(part.z / MM);
    const base = cfg.floor + (spec.kind === 'board' ? cfg.standoff : 0);
    return { part, spec, w, d, cx, cz, base, top: base + r3(box.h / MM), rot: ((part.rot % 4) + 4) % 4 };
  });

  // Inner cavity: all footprints plus the clearance; the lid sits on the walls
  const x0 = r3(Math.min(...items.map((i) => i.cx - i.w / 2)) - cfg.clearance);
  const x1 = r3(Math.max(...items.map((i) => i.cx + i.w / 2)) + cfg.clearance);
  const z0 = r3(Math.min(...items.map((i) => i.cz - i.d / 2)) - cfg.clearance);
  const z1 = r3(Math.max(...items.map((i) => i.cz + i.d / 2)) + cfg.clearance);
  const H = r3(Math.max(cfg.floor + 10, Math.max(...items.map((i) => i.top)) + cfg.clearance)); // top of the walls
  const X0 = r3(x0 - cfg.wall), X1 = r3(x1 + cfg.wall), Z0 = r3(z0 - cfg.wall), Z1 = r3(z1 + cfg.wall);
  const T = r3(H + cfg.lid); // top of the lid
  const walls = {
    north: { min: [X0, cfg.floor, Z0], max: [X1, H, z0], axes: [0, 1], thin: 2 },
    south: { min: [X0, cfg.floor, z1], max: [X1, H, Z1], axes: [0, 1], thin: 2 },
    west: { min: [X0, cfg.floor, z0], max: [x0, H, z1], axes: [2, 1], thin: 0 },
    east: { min: [x1, cfg.floor, z0], max: [X1, H, z1], axes: [2, 1], thin: 0 },
    lid: { min: [X0, H, Z0], max: [X1, T, Z1], axes: [0, 2], thin: 1 },
  };
  const holes = { north: [], south: [], east: [], west: [], lid: [] };
  const cutouts = [];

  // Face coordinates (a, b) of a wall -> a 3D point on the wall's middle
  const AXIS = ['x', 'y', 'z'];
  const faceBox = (wall, a0, a1, b0, b1) => {
    const w = walls[wall];
    const lo = [...w.min], hi = [...w.max];
    lo[w.axes[0]] = a0; hi[w.axes[0]] = a1;
    lo[w.axes[1]] = b0; hi[w.axes[1]] = b1;
    return { min: lo.map(r3), max: hi.map(r3) };
  };
  const clip = (wall, a0, a1, b0, b1) => {
    const w = walls[wall];
    const [ia, ib] = w.axes;
    return [Math.max(a0, w.min[ia]), Math.min(a1, w.max[ia]), Math.max(b0, w.min[ib]), Math.min(b1, w.max[ib])].map(r3);
  };
  const addRect = (wall, a0, a1, b0, b1, meta) => {
    const [ca0, ca1, cb0, cb1] = clip(wall, a0, a1, b0, b1);
    if (ca1 - ca0 < EPS || cb1 - cb0 < EPS) return;
    holes[wall].push({ a0: ca0, a1: ca1, b0: cb0, b1: cb1 });
    const { min, max } = faceBox(wall, ca0, ca1, cb0, cb1);
    cutouts.push({ ...meta, wall, shape: 'rect', min, max });
  };
  const addRound = (wall, ca, cb, r, meta) => {
    for (const d of discRects(ca, cb, r)) {
      const [a0, a1, b0, b1] = clip(wall, d.a0, d.a1, d.b0, d.b1);
      if (a1 - a0 > EPS && b1 - b0 > EPS) holes[wall].push({ a0, a1, b0, b1 });
    }
    const w = walls[wall];
    const center = w.min.map((v, i) => r3((v + w.max[i]) / 2));
    center[w.axes[0]] = r3(ca);
    center[w.axes[1]] = r3(cb);
    cutouts.push({ ...meta, wall, shape: 'round', center, r, axis: AXIS[w.thin], len: r3(w.max[w.thin] - w.min[w.thin]) });
  };
  // Axis of a wall's along-coordinate: x for north/south, z for east/west
  const along = (wall, x, z) => (wall === 'north' || wall === 'south' ? x : z);
  const gapTo = (wall, x, z) => ({ north: z - z0, south: z1 - z, west: x - x0, east: x1 - x })[wall];
  const nearest = (x, z) => WALLS.reduce((best, wall) => (gapTo(wall, x, z) < gapTo(best, x, z) ? wall : best));

  // For a whole part (a cable, not a plug): the wall closest to its edge; a tie goes to the side facing away
  // from the rest of the bench
  const centroid = [items.reduce((n, i) => n + i.cx, 0) / items.length, items.reduce((n, i) => n + i.cz, 0) / items.length];
  const nearestTo = (it) => {
    const edge = { north: it.cz - it.d / 2 - z0, south: z1 - (it.cz + it.d / 2), west: it.cx - it.w / 2 - x0, east: x1 - (it.cx + it.w / 2) };
    const away = { north: centroid[1] - it.cz, south: it.cz - centroid[1], west: centroid[0] - it.cx, east: it.cx - centroid[0] };
    const best = Math.min(...WALLS.map((w) => edge[w]));
    return WALLS.filter((w) => edge[w] < best + 0.5).reduce((a, b) => (away[b] > away[a] ? b : a));
  };

  const worldPoint = (it, lx, lz) => {
    const [dx, dz] = turn(lx, lz, it.rot);
    return [it.cx + dx, it.cz + dz];
  };
  const solids = [];
  let standoffs = 0;

  for (const it of items) {
    const meta = (label) => ({ id: `${it.part.id}.${label}`, part: it.part.id, label });

    // M3 standoffs under the board's mounting holes (hole [x, y] is from the corner, y up the drawing)
    if (it.spec.kind === 'board') {
      for (const [hx, hy] of it.spec.holes ?? []) {
        const [px, pz] = worldPoint(it, hx - (it.spec.size[0]) / 2, it.spec.size[1] / 2 - hy);
        solids.push({ kind: 'cylinder', center: [r3(px), cfg.floor, r3(pz)], r: STANDOFF.r, rInner: STANDOFF.rInner, h: cfg.standoff, segments: STANDOFF.segments, group: 'base', tag: 'standoff' });
        standoffs++;
      }
    }

    for (const f of featuresOf(it.part.type)) {
      const [sw, sd] = [it.spec.size[0], it.spec.size[1]]; // size before turning
      if (f.kind === 'port') {
        // Where the port sits on the part's edge, before and after turning
        let side = f.side, lx = 0, lz = 0;
        if (side !== 'auto') {
          const dir = SIDE_DIR[side];
          const vertical = dir[0] !== 0; // left/right edge: `along` runs up the drawing
          lx = vertical ? dir[0] * sw / 2 : f.along - sw / 2;
          lz = vertical ? sd / 2 - f.along : dir[1] * sd / 2;
        }
        const [px, pz] = side === 'auto' ? [it.cx, it.cz] : worldPoint(it, lx, lz);
        let wall = side === 'auto' ? nearestTo(it) : wallFacing(SIDE_DIR[side], it.rot);
        if (side !== 'auto' && gapTo(wall, px, pz) > REACH) wall = nearest(px, pz);
        const c = along(wall, px, pz), half = (f.w + PORT_PLAY) / 2;
        const y0 = it.base + f.lift - PORT_PLAY / 2;
        addRect(wall, c - half, c + half, y0, y0 + f.h + PORT_PLAY, meta(f.label));
      } else if (f.kind === 'eyes') {
        const wall = wallFacing(SIDE_DIR[f.side], it.rot);
        const dir = SIDE_DIR[f.side];
        for (const s of [-1, 1]) {
          const [px, pz] = worldPoint(it, dir[0] ? dir[0] * sw / 2 : s * f.pitch / 2, dir[1] ? dir[1] * sd / 2 : s * f.pitch / 2);
          addRound(wall, along(wall, px, pz), it.base + f.cy, f.r, { ...meta(f.label), id: `${it.part.id}.${f.label}${s < 0 ? 1 : 2}` });
        }
      } else if (f.kind === 'window') {
        const [px, pz] = worldPoint(it, f.offset[0], f.offset[1]);
        const [hw, hd] = it.rot % 2 ? [f.d / 2, f.w / 2] : [f.w / 2, f.d / 2];
        addRect('lid', px - hw, px + hw, pz - hd, pz + hd, meta(f.label));
      } else if (f.kind === 'hole') {
        const [px, pz] = worldPoint(it, f.offset[0], f.offset[1]);
        addRound('lid', px, pz, f.r, meta(f.label));
      } else if (f.kind === 'vents') {
        for (let k = 0; k < f.count; k++) {
          const [px, pz] = worldPoint(it, f.offset[0] + (k - (f.count - 1) / 2) * f.pitch, f.offset[1]);
          const [hw, hd] = it.rot % 2 ? [f.d / 2, f.w / 2] : [f.w / 2, f.d / 2];
          addRect('lid', px - hw, px + hw, pz - hd, pz + hd, { ...meta(f.label), id: `${it.part.id}.${f.label}${k + 1}` });
        }
      }
    }
  }

  // Floor, then each wall (carved around its openings)
  solids.unshift({ kind: 'box', min: [X0, 0, Z0].map(r3), max: [X1, cfg.floor, Z1].map(r3), group: 'base', tag: 'floor' });
  const carved = [];
  for (const wall of [...WALLS, 'lid']) {
    const w = walls[wall];
    const group = wall === 'lid' ? 'lid' : 'base';
    const tag = wall === 'lid' ? 'plate' : wall;
    for (const b of carve(w.min, w.max, w.axes, holes[wall])) carved.push({ kind: 'box', min: b.min.map(r3), max: b.max.map(r3), group, tag });
  }
  solids.push(...carved);

  // The lid's inner lip: a frame that goes into the box, with a little play
  const g = cfg.lipGap, t = cfg.lipThickness, ly0 = r3(H - cfg.lipHeight);
  const lx0 = r3(x0 + g), lx1 = r3(x1 - g), lz0 = r3(z0 + g), lz1 = r3(z1 - g);
  const lip = (min, max) => solids.push({ kind: 'box', min: min.map(r3), max: max.map(r3), group: 'lid', tag: 'lip' });
  lip([lx0, ly0, lz0], [lx1, H, lz0 + t]);
  lip([lx0, ly0, lz1 - t], [lx1, H, lz1]);
  lip([lx0, ly0, lz0 + t], [lx0 + t, H, lz1 - t]);
  lip([lx1 - t, ly0, lz0 + t], [lx1, H, lz1 - t]);

  // Print estimate (see printEstimate)
  const volume = r3(solids.reduce((sum, s) => sum + solidVolume(s), 0));
  const printedHeight = H + cfg.lid + cfg.lipHeight; // base up to H, plus the lid (plate and lip), printed apart
  const estimate = printEstimate(volume, printedHeight, Math.min(cfg.wall, cfg.floor, cfg.lid));

  return {
    ok: true,
    size: { w: r3(X1 - X0), d: r3(Z1 - Z0), h: T },
    inner: { min: [x0, cfg.floor, z0], max: [x1, H, z1] },
    outer: { min: [X0, 0, Z0], max: [X1, T, Z1] },
    wallsTop: H,
    config: cfg,
    parts: items.map((i) => ({ id: i.part.id, type: i.part.type, min: [r3(i.cx - i.w / 2), i.base, r3(i.cz - i.d / 2)], max: [r3(i.cx + i.w / 2), r3(i.top), r3(i.cz + i.d / 2)] })),
    solids,
    cutouts,
    standoffs,
    volume,
    ...estimate,
  };
}

// --- Print estimate -----------------------------------------------------------------------------------------
// PLA 1.24 g/cm3, 0.4 mm nozzle, 0.2 mm layers, 2 shells + 4 top/bottom layers (0.8 mm each side), 20 % infill.
//   shellShare = min(1, 2 * 0.8 / thinnest wall)                  the part of a wall that is solid shell
//   material   = volume * (shellShare + (1 - shellShare) * 0.2)   mm3 of plastic that is really printed
//   grams      = material / 1000 * 1.24
//   minutes    = (material / 3 mm3 per s  +  layers * 3 s per layer) / 60,   layers = printed height / 0.2
// 3 mm3/s is a realistic average for a hobby printer (50 mm/s at 0.4 x 0.2 is 4 mm3/s on paper, minus
// accelerations and moves); 3 s per layer covers travel and retraction. `layers` counts the base and the lid
// (printed apart). Shared faces between touching solids make `volume` exact, not inflated.
export const PRINT = { density: 1.24, shell: 0.8, infill: 0.2, flow: 3, layerHeight: 0.2, layerSeconds: 3 };

export function printEstimate(volume, printedHeight, thinnest = 2) {
  const share = Math.min(1, (2 * PRINT.shell) / Math.max(thinnest, 0.1));
  const material = volume * (share + (1 - share) * PRINT.infill);
  const seconds = material / PRINT.flow + (printedHeight / PRINT.layerHeight) * PRINT.layerSeconds;
  return { printMinutes: Math.max(1, Math.round(seconds / 60)), grams: Math.round(((material / 1000) * PRINT.density) * 10) / 10 };
}

// --- STL ----------------------------------------------------------------------------------------------------

// Model frame (y up) -> print frame (z up). The base keeps its orientation; the lid is turned over so its flat
// plate lies on the bed and the lip points up. Both are moved so their lowest corner is at the origin.
function printFrame(enclosure, group, assembled) {
  const { min, max } = enclosure.outer;
  const T = max[1];
  const base = (p) => [p[0] - min[0], max[2] - p[2], p[1]];
  const lid = (p) => [p[0] - min[0], p[2] - min[2], T - p[1]];
  return { base, lid: assembled ? base : lid, shift: assembled || group ? 0 : (max[0] - min[0]) + 10 };
}

function selectSolids(enclosure, group) {
  return enclosure.solids.filter((s) => !group || s.group === group);
}

// Binary STL: 80-byte header, uint32 triangle count, then per triangle normal + 3 vertices (float32 LE) + uint16 0.
// group 'base' | 'lid' exports that piece alone, ready to print; no group lays both out side by side.
// { assembled: true } keeps the box closed as it looks on the bench (for viewers, not for printing).
export function toStl(enclosure, group = null, { assembled = false } = {}) {
  const frame = printFrame(enclosure, group, assembled);
  const tris = [];
  for (const solid of selectSolids(enclosure, group)) {
    const place = solid.group === 'lid' ? frame.lid : frame.base;
    const dx = solid.group === 'lid' ? frame.shift : 0;
    for (const tri of solidTriangles(solid)) tris.push(tri.map((p) => { const q = place(p); return [q[0] + dx, q[1], q[2]]; }));
  }
  const buffer = new ArrayBuffer(84 + 50 * tris.length);
  const view = new DataView(buffer);
  const header = 'Qubbot enclosure (binary STL, mm)';
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, tris.length, true);
  let at = 84;
  for (const [a, b, c] of tris) {
    for (const v of [triangleNormal(a, b, c), a, b, c]) {
      for (const n of v) { view.setFloat32(at, n, true); at += 4; }
    }
    view.setUint16(at, 0, true);
    at += 2;
  }
  return buffer;
}

// --- OpenSCAD -----------------------------------------------------------------------------------------------

// OpenSCAD is z-up too: X = x, Y = -z, Z = y of this model.
const num = (v) => String(Math.round(v * 1000) / 1000);
const vec = (a) => `[${a.map(num).join(', ')}]`;
const pt = (p) => [p[0], -p[2], p[1]];

function scadCube(min, max, pad = -1) {
  const lo = pt([min[0], min[1], max[2]]);
  const size = [max[0] - min[0], max[2] - min[2], max[1] - min[1]];
  if (pad >= 0) {
    // grow the cutter through the wall's thin axis (model axis 0 = x, 1 = y, 2 = z -> scad axis 0, 2, 1)
    const axis = [0, 2, 1][pad];
    lo[axis] -= 0.01;
    size[axis] += 0.02;
  }
  return `translate(${vec(lo)}) cube(${vec(size)});`;
}

export function toScad(enclosure) {
  if (!enclosure?.ok) return '// Sin caja: falta una placa.\n';
  const { outer, inner, wallsTop: H, config: cfg } = enclosure;
  const thin = { north: 2, south: 2, east: 0, west: 0, lid: 1 };
  const cut = (c) => {
    if (c.shape === 'rect') return scadCube(c.min, c.max, thin[c.wall]);
    const rot = { x: '[0, 90, 0]', y: '[0, 0, 0]', z: '[90, 0, 0]' }[c.axis];
    return `translate(${vec(pt(c.center))}) rotate(${rot}) cylinder(r = ${num(c.r)}, h = ${num(c.len + 0.02)}, center = true);`;
  };
  const cutsOf = (wall) => enclosure.cutouts.filter((c) => (wall === 'lid') === (c.wall === 'lid')).map((c) => `    ${cut(c)} // ${c.part} ${c.label}`);
  const lipOuter = [[inner.min[0] + cfg.lipGap, H - cfg.lipHeight, inner.min[2] + cfg.lipGap], [inner.max[0] - cfg.lipGap, H, inner.max[2] - cfg.lipGap]];
  const t = cfg.lipThickness;
  const lipInner = [[lipOuter[0][0] + t, lipOuter[0][1], lipOuter[0][2] + t], [lipOuter[1][0] - t, lipOuter[1][1], lipOuter[1][2] - t]];
  const standoffs = enclosure.solids.filter((s) => s.tag === 'standoff');
  const lines = [
    '// Caja para imprimir hecha por Qubbot. Medidas en milimetros.',
    '// Abre este archivo en OpenSCAD (openscad.org) para cambiar medidas y exportar el STL.',
    '// Para imprimir: base() tal cual, y lid() boca abajo.',
    '',
    `wall = ${num(cfg.wall)};      // grosor de las paredes`,
    `floor_t = ${num(cfg.floor)};    // grosor del piso`,
    `lid_t = ${num(cfg.lid)};      // grosor de la tapa`,
    `clearance = ${num(cfg.clearance)};  // aire alrededor de las piezas`,
    'explode = 0;      // sube la tapa para ver por dentro (por ejemplo 40)',
    '$fn = 48;',
    '',
    `outer_min = ${vec(pt([outer.min[0], outer.min[1], outer.max[2]]))};`,
    `outer_size = ${vec([outer.max[0] - outer.min[0], outer.max[2] - outer.min[2], H])};`,
    `inner_min = ${vec(pt([inner.min[0], inner.min[1], inner.max[2]]))};`,
    `inner_size = ${vec([inner.max[0] - inner.min[0], inner.max[2] - inner.min[2], H - inner.min[1]])};`,
    '',
    '// Pisos, paredes y aberturas',
    'module base() {',
    '  difference() {',
    '    translate(outer_min) cube(outer_size);',
    '    translate(inner_min) cube([inner_size[0], inner_size[1], inner_size[2] + 0.02]);',
    ...cutsOf('walls'),
    '  }',
    '  // Separadores M3 bajo la placa',
    ...standoffs.map((s) => {
      const at = pt(s.center);
      const hole = [at[0], at[1], at[2] - 0.01];
      return `  difference() { translate(${vec(at)}) cylinder(r = ${num(s.r)}, h = ${num(s.h)}, $fn = ${s.segments}); translate(${vec(hole)}) cylinder(r = ${num(s.rInner)}, h = ${num(s.h + 0.02)}, $fn = ${s.segments}); }`;
    }),
    '}',
    '',
    '// Tapa con su borde interior para que encaje',
    'module lid() {',
    '  difference() {',
    `    ${scadCube([outer.min[0], H, outer.min[2]], [outer.max[0], outer.max[1], outer.max[2]])}`,
    ...cutsOf('lid'),
    '  }',
    '  difference() {',
    `    ${scadCube(lipOuter[0], lipOuter[1])}`,
    `    ${scadCube([lipInner[0][0], lipInner[0][1] - 0.01, lipInner[0][2]], [lipInner[1][0], lipInner[1][1] + 0.02, lipInner[1][2]])}`,
    '  }',
    '}',
    '',
    'base();',
    'translate([0, 0, explode]) lid();',
    '',
  ];
  return lines.join('\n');
}
