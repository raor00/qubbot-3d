// The bench's wires in three.js: a glossy tube along the arc from wireCurve, plugs at both pins, a thicker
// invisible tube to click on, and glowing particles that flow while the simulation runs. Also the dashed
// elastic line shown while a wire is being made. The geometry math lives in wireCurve.js (pure, tested).
import * as THREE from 'three';
import { PALETTE } from '../materials.js';
import { pointAlong, wireLength } from './wireCurve.js';

export const WIRE_COLORS = { power: 0xd9534f, gnd: 0x2b2f35, bus: 0x4a90e2, signal: 0xe6e9ec };
// Particles are lit above the bloom threshold, so a flowing wire really glows
const SPARK_COLORS = { power: 0xff9a8f, gnd: 0xa9b6ff, bus: 0x8fc2ff, signal: 0xd4d0ff };
const SPARK_GAIN = 2.4;

const RADIUS = 0.045;
const PICK_RADIUS = 0.13;
const PICK_MARGIN = 0.32;   // arc length at each end that stays clickable as the pin, not as the wire
const PLUG_RADIUS = 0.065;
const SPARK_RADIUS = 0.058;
const SPARK_SPEED = 2.6;    // world units per second at full flow
const REVEAL_SECONDS = 0.45;
const MAX_SPARKS = 14;

const plugGeometry = new THREE.SphereGeometry(PLUG_RADIUS, 12, 8);
const sparkGeometry = new THREE.SphereGeometry(SPARK_RADIUS, 8, 6);
const sparkMaterials = {};
const sparkMaterial = (kind) => (sparkMaterials[kind] ??= new THREE.MeshBasicMaterial({
  color: new THREE.Color(SPARK_COLORS[kind] ?? SPARK_COLORS.signal).multiplyScalar(SPARK_GAIN),
  toneMapped: false,
}));

const vec = (p) => new THREE.Vector3(p.x, p.y, p.z);
const easeOut = (k) => 1 - (1 - k) ** 3;

function tubeGeometry(points, radius, radial) {
  const curve = new THREE.CatmullRomCurve3(points.map(vec), false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, radial, false);
}

// One wire. `reverse`: the particles travel from the last point to the first. `reveal`: draw it growing
// out of its first pin (a new wire) instead of showing it whole.
export function buildWire({ id, kind = 'signal', points, reverse = false, reveal = false }) {
  const group = new THREE.Group();
  group.userData.wire = id;
  const color = WIRE_COLORS[kind] ?? WIRE_COLORS.signal;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.15, emissive: color, emissiveIntensity: 0 });
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), material);
  tube.castShadow = true;
  const pick = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
  pick.userData.pick = { type: 'wire', id };
  const plugA = new THREE.Mesh(plugGeometry, material);
  const plugB = new THREE.Mesh(plugGeometry, material);
  const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial(kind), MAX_SPARKS);
  sparks.frustumCulled = false; // its bounds are not updated as the instances move
  sparks.count = 0;
  group.add(tube, pick, plugA, plugB, sparks);

  let curvePoints = points;
  let length = 1;
  let age = reveal ? 0 : REVEAL_SECONDS;
  let phase = 0;
  let hot = false;
  const dummy = new THREE.Object3D();

  function setPoints(next) {
    curvePoints = next;
    length = wireLength(next) || 1;
    tube.geometry.dispose();
    tube.geometry = tubeGeometry(next, RADIUS, 6);
    // the pickable part skips the ends so the pins keep their own clicks
    const skip = Math.max(1, Math.ceil(((next.length - 1) * PICK_MARGIN) / length));
    const middle = next.slice(skip, next.length - skip);
    pick.geometry.dispose();
    pick.geometry = tubeGeometry(middle.length >= 2 ? middle : next, PICK_RADIUS, 4);
    plugA.position.copy(vec(next[0]));
    plugB.position.copy(vec(next.at(-1)));
    applyReveal();
  }

  function applyReveal() {
    const k = easeOut(Math.min(1, age / REVEAL_SECONDS));
    const index = tube.geometry.index;
    if (index) tube.geometry.setDrawRange(0, Math.floor((index.count * k) / 3) * 3);
    plugB.visible = k >= 0.98;
  }

  // flow 0..1 (simulation); the wire's own glow follows the same value a little, so the tube feels alive
  function update(dt, flow = 0, running = false) {
    if (age < REVEAL_SECONDS) {
      age = Math.min(REVEAL_SECONDS, age + dt);
      applyReveal();
    }
    const live = running && flow > 0.02 && age >= REVEAL_SECONDS;
    material.emissiveIntensity = hot ? 0.35 : live ? 0.12 * flow : 0;
    if (!live) { sparks.count = 0; return; }
    const n = Math.max(3, Math.min(MAX_SPARKS, Math.round(length * 1.15)));
    phase = (phase + (dt * SPARK_SPEED * (0.35 + 0.65 * flow)) / length) % 1;
    for (let i = 0; i < n; i++) {
      const u = (phase + i / n) % 1;
      const p = pointAlong(curvePoints, reverse ? 1 - u : u, length);
      // a soft pulse along the wire, stronger with more flow
      const s = (0.55 + 0.45 * Math.sin((u * 6 + phase * 4) * Math.PI)) * (0.55 + 0.6 * flow);
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(Math.max(0.25, s));
      dummy.updateMatrix();
      sparks.setMatrixAt(i, dummy.matrix);
    }
    sparks.count = n;
    sparks.instanceMatrix.needsUpdate = true;
  }

  setPoints(points);

  return {
    group,
    id,
    kind,
    pickMesh: pick,
    setPoints,
    setReverse(value) { reverse = value; },
    setHot(value) { hot = Boolean(value); },
    update,
    dispose() {
      tube.geometry.dispose();
      pick.geometry.dispose();
      pick.material.dispose();
      material.dispose();
      sparks.dispose();
      group.removeFromParent();
    },
  };
}

// The dashed line from the chosen pin to the cursor while the person is wiring. Marching dashes.
export function buildElasticWire() {
  const MAX = 40;
  const positions = new Float32Array(MAX * 3);
  const geometry = new THREE.BufferGeometry();
  const distances = new Float32Array(MAX);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('lineDistance', new THREE.BufferAttribute(distances, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineDashedMaterial({
    color: PALETTE.accent, dashSize: 0.16, gapSize: 0.11, transparent: true, opacity: 0.95, toneMapped: false,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  line.raycast = () => {}; // never picked

  return {
    object: line,
    // points: [{ x, y, z }]; t: seconds, for the marching dashes
    show(points, t = 0) {
      const n = Math.min(MAX, points.length);
      const shift = (t * 0.6) % 0.27; // dashes crawl toward the cursor
      let run = -shift;
      for (let i = 0; i < n; i++) {
        const p = points[i];
        if (i) run += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y, p.z - points[i - 1].z);
        positions.set([p.x, p.y, p.z], i * 3);
        distances[i] = run;
      }
      geometry.setDrawRange(0, n);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.lineDistance.needsUpdate = true;
      line.visible = true;
    },
    hide() { line.visible = false; },
    dispose() { geometry.dispose(); material.dispose(); line.removeFromParent(); },
  };
}
