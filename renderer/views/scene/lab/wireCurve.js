// Pure math for the bench's wires (no three.js): the arc a jumper wire draws between two pins, points along
// it (for the flowing particles) and how a part's local point lands on the bench. Tested in
// tests/renderer/wireCurve.test.mjs.

export const ARC = {
  base: 0.35,     // lift of a short wire (world units: 1 = 10 mm)
  perUnit: 0.22,  // extra lift per unit of distance
  max: 2.6,       // a long wire does not fly away
  pull: 0.12,     // control points sit this far in from each end: the wire leaves the pin going up
  spread: 0.09,   // sideways step between parallel wires
  segments: 28,
};

// Sideways step for the index-th wire between the same two parts: 0, +1, -1, +2, -2...
export const spreadStep = (index = 0) => (index <= 0 ? 0 : (index % 2 ? 1 : -1) * Math.ceil(index / 2));

// [{ x, y, z }] from a to b (both included, exact): a cubic bezier raised like a slack jumper wire.
// Its height grows with the distance; `index` shifts parallel wires sideways so they do not overlap.
export function wireCurve(a, b, { index = 0, segments = ARC.segments, lift = null } = {}) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const h = lift ?? Math.min(ARC.max, ARC.base + ARC.perUnit * dist);
  // horizontal normal (a vertical pair of pins gets an arbitrary but fixed one)
  const nx = dist > 1e-6 ? -dz / dist : 1, nz = dist > 1e-6 ? dx / dist : 0;
  const side = spreadStep(index) * ARC.spread * (1 + dist * 0.08);
  const top = Math.max(a.y, b.y) + h;
  const c1 = { x: a.x + dx * ARC.pull + nx * side, y: top, z: a.z + dz * ARC.pull + nz * side };
  const c2 = { x: b.x - dx * ARC.pull + nx * side, y: top, z: b.z - dz * ARC.pull + nz * side };
  const n = Math.max(2, Math.round(segments));
  const points = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
    points.push({
      x: k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x,
      y: k0 * a.y + k1 * c1.y + k2 * c2.y + k3 * b.y,
      z: k0 * a.z + k1 * c1.z + k2 * c2.z + k3 * b.z,
    });
  }
  points[0] = { ...a };
  points[n] = { ...b };
  return points;
}

const gap = (p, q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);

export function wireLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += gap(points[i - 1], points[i]);
  return total;
}

// The point at fraction u (0..1) of the wire's length; u wraps around, so moving particles can loop
export function pointAlong(points, u, length = wireLength(points)) {
  if (points.length < 2 || length <= 0) return { ...points[0] };
  const f = ((u % 1) + 1) % 1;
  let left = f * length;
  if (u >= 1 && f === 0) return { ...points.at(-1) };
  for (let i = 1; i < points.length; i++) {
    const step = gap(points[i - 1], points[i]);
    if (left <= step) {
      const k = step > 0 ? left / step : 0;
      const p = points[i - 1], q = points[i];
      return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k };
    }
    left -= step;
  }
  return { ...points.at(-1) };
}

// A part's turn on the bench as three.js rotation.y. labLayout's turn() maps (x, z) -> (-z, x) per
// quarter; three's rotation.y = a maps (x, z) -> (x cos a + z sin a, -x sin a + z cos a), which is that
// map for a = -PI/2. So rot quarter turns = -rot * PI/2.
export const partAngle = (rot = 0) => (-(rot % 4) * Math.PI) / 2;

// A part's local point (centered on its footprint) on the bench, the way three places it
export function localToBench({ x, y = 0, z }, part, lift = 0) {
  const a = partAngle(part.rot);
  const c = Math.cos(a), s = Math.sin(a);
  return { x: part.x + x * c + z * s, y: y + lift, z: part.z - x * s + z * c };
}
