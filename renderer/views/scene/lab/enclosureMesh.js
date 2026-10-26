// The printable enclosure on the bench: a frosted, translucent preview (like a PLA print) built from the very
// same triangles that go into the STL. Two groups, base and lid, split into pieces that can fly apart:
//   buildEnclosure(data) -> { group, setExploded(bool), update(t, dt), replay(), dispose() }
// `data` is enclosureFor(design). `group` scales mm to world units (1 unit = 10 mm) and sits on the bench floor, so
// add it to a layer as is and do not move it. Call update(t, dt) every frame (seconds); the assembly intro plays
// by itself when it is built (the pieces fly in from above), and the exploded view eases in about 0.8 s.
import * as THREE from 'three';
import { PALETTE } from '../materials.js';
import { solidTriangles, triangleNormal } from '../../../models/enclosureModel.js';
import { MM } from '../../../viewmodels/labLayout.js';

const EXPLODE_SECONDS = 0.8;
const INTRO_SECONDS = 0.9;      // each piece's own flight
const INTRO_HEIGHT = 160;       // mm above its place a piece starts
const SPREAD = 22;              // mm a wall moves outward when exploded
const LID_LIFT = 70;            // mm the lid rises when exploded
const LID_TILT = -0.45;         // radians: the lid opens like a hinge on its back edge

// Where each piece goes when exploded and when it arrives (seconds after the intro starts)
const PIECES = {
  floor: { delay: 0 },
  standoff: { delay: 0.25 },
  north: { delay: 0.4, out: [0, 0, -1] },
  east: { delay: 0.5, out: [1, 0, 0] },
  south: { delay: 0.6, out: [0, 0, 1] },
  west: { delay: 0.7, out: [-1, 0, 0] },
  lid: { delay: 1.1, lid: true },
};
const pieceOf = (solid) => (solid.group === 'lid' ? 'lid' : solid.tag);

const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => {
  const c1 = 1.20158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Flat-shaded geometry of some solids, moved so `pivot` is the origin
function geometryOf(solids, pivot) {
  const tris = solids.flatMap(solidTriangles);
  const position = new Float32Array(tris.length * 9);
  const normal = new Float32Array(tris.length * 9);
  tris.forEach((tri, i) => {
    const n = triangleNormal(...tri);
    tri.forEach((p, k) => {
      for (let a = 0; a < 3; a++) {
        position[i * 9 + k * 3 + a] = p[a] - pivot[a];
        normal[i * 9 + k * 3 + a] = n[a];
      }
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  return geometry;
}

function boundsOf(solids) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of solids) {
    const min = s.kind === 'cylinder' ? [s.center[0] - s.r, s.center[1], s.center[2] - s.r] : s.min;
    const max = s.kind === 'cylinder' ? [s.center[0] + s.r, s.center[1] + s.h, s.center[2] + s.r] : s.max;
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], min[i]); hi[i] = Math.max(hi[i], max[i]); }
  }
  return { lo, hi };
}

export function buildEnclosure(data) {
  const group = new THREE.Group();
  group.name = 'enclosure';
  group.scale.setScalar(MM);
  const empty = { group, setExploded() {}, update() {}, replay() {}, dispose() {} };
  if (!data?.ok || !data.solids?.length) return empty;
  group.position.y = -data.config.floor * MM; // the floor's top is the bench floor

  const baseGroup = new THREE.Group(), lidGroup = new THREE.Group();
  baseGroup.name = 'base';
  lidGroup.name = 'lid';
  group.add(baseGroup, lidGroup);

  const shell = (color, opacity) => new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0, emissive: 0x2b2a52, emissiveIntensity: 0.3,
    transparent: true, opacity, depthWrite: false, side: THREE.FrontSide,
  });
  const post = () => new THREE.MeshStandardMaterial({
    color: PALETTE.accent, roughness: 0.5, metalness: 0.1, emissive: PALETTE.accent, emissiveIntensity: 0.12,
    transparent: true, opacity: 0.9, depthWrite: true,
  });
  const edge = (opacity) => new THREE.LineBasicMaterial({ color: 0xf1eeff, transparent: true, opacity, depthWrite: false });

  const pieces = [];
  const geometries = [];
  const materials = [];
  for (const [name, spec] of Object.entries(PIECES)) {
    const solids = data.solids.filter((s) => pieceOf(s) === name);
    if (!solids.length) continue;
    const { lo, hi } = boundsOf(solids);
    // The lid turns about its back edge; everything else about its own center
    const pivot = spec.lid ? [(lo[0] + hi[0]) / 2, data.wallsTop, lo[2]] : lo.map((v, i) => (v + hi[i]) / 2);
    const geometry = geometryOf(solids, pivot);
    geometries.push(geometry);
    const isPost = name === 'standoff';
    const material = isPost ? post() : shell(spec.lid ? 0xdad4ff : 0xeeeaff, spec.lid ? 0.38 : 0.32);
    materials.push(material);
    const holder = new THREE.Group();
    holder.name = name;
    holder.position.set(...pivot);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = isPost ? 1 : 2;
    holder.add(mesh);
    let line = null;
    if (!isPost) {
      const edges = new THREE.EdgesGeometry(geometry, 28);
      geometries.push(edges);
      line = new THREE.LineSegments(edges, edge(0.55));
      line.renderOrder = 3;
      materials.push(line.material);
      holder.add(line);
    }
    (spec.lid ? lidGroup : baseGroup).add(holder);
    pieces.push({ name, spec, holder, pivot, mesh, line, baseOpacity: material.opacity, lineOpacity: 0.55 });
  }

  let introT = 0;
  let shown = 0;     // exploded progress 0..1, linear
  let goal = 0;

  function pose(t = 0) {
    const e = easeInOutCubic(shown);
    for (const p of pieces) {
      const flight = clamp01((introT - p.spec.delay) / INTRO_SECONDS);
      const drop = (1 - easeOutBack(flight)) * INTRO_HEIGHT;
      const out = p.spec.out ?? [0, 0, 0];
      p.holder.position.set(
        p.pivot[0] + out[0] * SPREAD * e,
        p.pivot[1] + (p.spec.lid ? LID_LIFT * e : 0) + drop,
        p.pivot[2] + out[2] * SPREAD * e,
      );
      p.holder.rotation.x = p.spec.lid ? LID_TILT * e : 0;
      p.holder.visible = flight > 0;
      const fade = smooth(clamp01(flight * 1.6));
      p.mesh.material.opacity = p.baseOpacity * fade;
      if (p.line) p.line.material.opacity = p.lineOpacity * fade * (0.85 + 0.15 * Math.sin(t * 1.6 + p.pivot[0] * 0.05));
    }
  }
  pose();

  return {
    group,
    setExploded(on) { goal = on ? 1 : 0; },
    update(t = 0, dt = 0) {
      introT += dt;
      const step = dt / EXPLODE_SECONDS;
      shown = goal > shown ? Math.min(goal, shown + step) : Math.max(goal, shown - step);
      pose(t);
    },
    replay() { introT = 0; pose(); },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
