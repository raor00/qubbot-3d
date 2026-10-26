// The lab's circuit (docs/features/laboratorio/README.md): what is on the bench and how it is wired.
// Pure and deterministic: the window, the chat's agent (through main's MCP tools) and the tests share it.
// The agent proposes; checkDesign decides whether a wiring is safe, never a model.
//   design: { version: 1, parts: [{ id, type, x, z, rot }], wires: [{ id, from: { part, pin }, to: { part, pin } }] }
// x and z are bench units (1 = 10 mm); rot is a quarter turn count (0..3).
import { componentOf } from './componentCatalog.js';

export const DESIGN_FILE = 'laboratorio/circuito.json';
export const LIMITS = { parts: 60, wires: 240, coord: 500 };

const POWER_KINDS = new Set(['5v', '3v3', 'vin']);
const BUS_KINDS = new Set(['sda', 'scl']);

export function emptyDesign() {
  return { version: 1, parts: [], wires: [] };
}

const finite = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Math.max(-LIMITS.coord, Math.min(LIMITS.coord, Number(n))) : fallback);
const pinOf = (design, end) => {
  const part = design.parts.find((p) => p.id === end?.part);
  const spec = part && componentOf(part.type);
  return spec?.pins.find((p) => p.id === end.pin) ? { part, spec, pin: spec.pins.find((p) => p.id === end.pin) } : null;
};
const sameEnd = (a, b) => a.part === b.part && a.pin === b.pin;
const sameWire = (w, a, b) => (sameEnd(w.from, a) && sameEnd(w.to, b)) || (sameEnd(w.from, b) && sameEnd(w.to, a));

// Reads the design file. Anything unknown or broken is dropped (a part of a type not in the catalog, a
// wire to a pin that does not exist), so a hand-edited or agent-written file can never break the bench.
export function parseDesign(text) {
  let raw;
  try {
    raw = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { design: emptyDesign(), dropped: 1, error: 'json' };
  }
  const design = emptyDesign();
  let dropped = 0;
  const ids = new Set();
  for (const p of Array.isArray(raw?.parts) ? raw.parts : []) {
    const id = typeof p?.id === 'string' ? p.id.slice(0, 40) : '';
    if (!id || ids.has(id) || !componentOf(p.type) || design.parts.length >= LIMITS.parts) { dropped++; continue; }
    ids.add(id);
    design.parts.push({ id, type: p.type, x: finite(p.x), z: finite(p.z), rot: ((Math.round(Number(p.rot) || 0) % 4) + 4) % 4 });
  }
  for (const w of Array.isArray(raw?.wires) ? raw.wires : []) {
    const from = { part: w?.from?.part, pin: w?.from?.pin };
    const to = { part: w?.to?.part, pin: w?.to?.pin };
    if (!pinOf(design, from) || !pinOf(design, to) || sameEnd(from, to) || design.wires.some((x) => sameWire(x, from, to)) || design.wires.length >= LIMITS.wires) { dropped++; continue; }
    design.wires.push({ id: `w${design.wires.length + 1}`, from, to });
  }
  return { design, dropped, error: null };
}

export function serializeDesign(design) {
  return `${JSON.stringify(design, null, 2)}\n`;
}

const nextId = (list, prefix) => {
  const used = new Set(list.map((x) => x.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

// -> { design, id } (the same design and id null when the type is unknown or the bench is full)
export function addPart(design, type, { x = 0, z = 0, rot = 0 } = {}) {
  if (!componentOf(type) || design.parts.length >= LIMITS.parts) return { design, id: null };
  const id = nextId(design.parts, `${type}-`);
  return { design: { ...design, parts: [...design.parts, { id, type, x: finite(x), z: finite(z), rot: ((rot % 4) + 4) % 4 }] }, id };
}

export function movePart(design, id, { x, z }) {
  return { ...design, parts: design.parts.map((p) => (p.id === id ? { ...p, x: finite(x, p.x), z: finite(z, p.z) } : p)) };
}

export function rotatePart(design, id) {
  return { ...design, parts: design.parts.map((p) => (p.id === id ? { ...p, rot: (p.rot + 1) % 4 } : p)) };
}

// Removing a part takes its wires with it
export function removePart(design, id) {
  return { ...design, parts: design.parts.filter((p) => p.id !== id), wires: design.wires.filter((w) => w.from.part !== id && w.to.part !== id) };
}

// -> { design, ok, reason?, id? }   reason: 'unknown' | 'same' | 'duplicate' | 'full'
export function connect(design, from, to) {
  if (!pinOf(design, from) || !pinOf(design, to)) return { design, ok: false, reason: 'unknown' };
  if (sameEnd(from, to)) return { design, ok: false, reason: 'same' };
  if (design.wires.some((w) => sameWire(w, from, to))) return { design, ok: false, reason: 'duplicate' };
  if (design.wires.length >= LIMITS.wires) return { design, ok: false, reason: 'full' };
  const id = nextId(design.wires, 'w');
  return { design: { ...design, wires: [...design.wires, { id, from: { part: from.part, pin: from.pin }, to: { part: to.part, pin: to.pin } }] }, ok: true, id };
}

export function disconnect(design, wireId) {
  return { ...design, wires: design.wires.filter((w) => w.id !== wireId) };
}

// --- Nets: pins joined by wires (directly or through other pins) ---
const key = (end) => `${end.part}:${end.pin}`;
function netsOf(design) {
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  const add = (k) => { if (!parent.has(k)) parent.set(k, k); };
  design.wires.forEach((w) => { add(key(w.from)); add(key(w.to)); parent.set(find(key(w.from)), find(key(w.to))); });
  const nets = new Map();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!nets.has(root)) nets.set(root, []);
    const [part, pin] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)];
    nets.get(root).push({ part, pin });
  }
  const byPin = new Map();
  for (const members of nets.values()) members.forEach((m) => byPin.set(key(m), members));
  return byPin;
}

// What a net holds: the board pins in it (with their kinds), and whether it carries power or ground
function describeNet(design, members) {
  const boardPins = [];
  let power = new Set();
  let ground = false;
  for (const m of members) {
    const found = pinOf(design, m);
    if (!found) continue;
    if (found.spec.kind === 'board') {
      boardPins.push({ part: found.part, spec: found.spec, pin: found.pin });
      found.pin.kinds.forEach((k) => { if (POWER_KINDS.has(k)) power.add(k); if (k === 'gnd') ground = true; });
    } else if (found.spec.supplies && found.pin.id === '+') power.add('vin');
    else if (found.pin.accepts.length === 1 && found.pin.accepts[0] === 'gnd') ground = true;
  }
  return { boardPins, power, ground };
}

const LEVEL_RANK = { green: 0, yellow: 1, red: 2 };
const worse = (a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a);

// The deterministic checker. -> { level, issues: [{ level, key, part?, pin?, ... }], parts: { id: level }, budget: [{ board, usedMa, budgetMa }] }
//   red:    'short' (power and ground joined), 'mixedPower' (5 V and 3.3 V joined), 'overvoltage' (a 3.3 V part on 5 V)
//   yellow: 'missing' (a required pin unwired), 'wrongPin' (a pin that cannot do that), 'undervoltage',
//           'pinShared' (one board signal pin for two parts), 'level' (a 5 V signal into a 3.3 V board),
//           'budget' (the board cannot feed everything on its 5 V), 'noBoard'
export function checkDesign(design) {
  const issues = [];
  const nets = netsOf(design);
  const push = (issue) => issues.push(issue);
  const boards = design.parts.filter((p) => componentOf(p.type)?.kind === 'board');
  if (!boards.length && design.parts.length) push({ level: 'yellow', key: 'noBoard' });

  const seenNets = new Set();
  for (const members of new Set(nets.values())) {
    if (seenNets.has(members)) continue;
    seenNets.add(members);
    const net = describeNet(design, members);
    if (net.ground && net.power.size) push({ level: 'red', key: 'short', part: members[0].part, pin: members[0].pin, pins: members });
    if (net.power.has('5v') && net.power.has('3v3')) push({ level: 'red', key: 'mixedPower', part: members[0].part, pin: members[0].pin, pins: members });
    // A board signal pin used by more than one part (power, ground and the I2C bus can be shared)
    for (const bp of net.boardPins) {
      if (bp.pin.kinds.some((k) => POWER_KINDS.has(k) || k === 'gnd')) continue;
      const users = members.filter((m) => m.part !== bp.part.id && componentOf(design.parts.find((p) => p.id === m.part)?.type)?.kind === 'part');
      const bus = users.length > 1 && users.every((u) => pinOf(design, u)?.pin.accepts.some((k) => BUS_KINDS.has(k)));
      if (users.length > 1 && !bus) push({ level: 'yellow', key: 'pinShared', part: users[1].part, pin: users[1].pin, board: bp.part.id, boardPin: bp.pin.id });
    }
  }

  const draw = new Map(); // board id -> mA on its 5 V
  for (const part of design.parts) {
    const spec = componentOf(part.type);
    if (spec.kind !== 'part') continue;
    for (const pin of spec.pins) {
      const members = nets.get(key({ part: part.id, pin: pin.id }));
      if (!members) {
        if (pin.required) push({ level: 'yellow', key: 'missing', part: part.id, pin: pin.id });
        continue;
      }
      const net = describeNet(design, members);
      const offered = new Set(net.boardPins.flatMap((bp) => bp.pin.kinds));
      if (!net.boardPins.length) continue; // wired only to other parts: nothing to compare with
      const fits = pin.accepts.some((k) => offered.has(k));
      if (pin.accepts.some((k) => POWER_KINDS.has(k))) {
        if (!fits && offered.has('5v') && !pin.accepts.includes('5v')) push({ level: 'red', key: 'overvoltage', part: part.id, pin: pin.id });
        else if (!fits && offered.has('3v3') && !pin.accepts.includes('3v3')) push({ level: 'yellow', key: 'undervoltage', part: part.id, pin: pin.id });
        else if (!fits) push({ level: 'yellow', key: 'wrongPin', part: part.id, pin: pin.id, wants: pin.accepts });
        if (offered.has('5v')) net.boardPins.filter((bp) => bp.pin.kinds.includes('5v')).forEach((bp) => draw.set(bp.part.id, (draw.get(bp.part.id) ?? 0) + (spec.mA ?? 0)));
        continue;
      }
      if (!fits) {
        if (!(pin.accepts.includes('gnd') && offered.has('gnd'))) push({ level: 'yellow', key: 'wrongPin', part: part.id, pin: pin.id, wants: pin.accepts });
        continue;
      }
      if (spec.out5v && !pin.accepts.includes('gnd') && net.boardPins.some((bp) => bp.spec.logic < 5)) push({ level: 'yellow', key: 'level', part: part.id, pin: pin.id });
    }
  }
  const budget = boards.map((b) => ({ board: b.id, usedMa: draw.get(b.id) ?? 0, budgetMa: componentOf(b.type).budgetMa }));
  budget.filter((b) => b.usedMa > b.budgetMa).forEach((b) => push({ level: 'yellow', key: 'budget', part: b.board, usedMa: b.usedMa, budgetMa: b.budgetMa }));

  const parts = Object.fromEntries(design.parts.map((p) => [p.id, 'green']));
  let level = 'green';
  for (const issue of issues) {
    level = worse(level, issue.level);
    if (issue.part && parts[issue.part]) parts[issue.part] = worse(parts[issue.part], issue.level);
  }
  return { level, issues, parts, budget };
}

// --- Automatic wiring: the "Conectar solo" button and the agent's suggestion ---
// Which board pins a part pin should try first: power and ground by name, the I2C bus by kind (shared),
// a signal on the scarcest-first rule (a plain digital need takes a pin that is neither PWM nor analog).
function candidatesFor(pin, board) {
  const pins = board.pins;
  const has = (p, k) => p.kinds.includes(k);
  if (pin.accepts.includes('gnd')) return pins.filter((p) => has(p, 'gnd'));
  if (pin.accepts.includes('vin')) return pins.filter((p) => has(p, 'vin'));
  if (pin.accepts.some((k) => POWER_KINDS.has(k))) {
    // A 3.3 V board feeds parts that take both from 3.3 V (its signals are 3.3 V too)
    const order = board.logic < 5 ? ['3v3', '5v'] : ['5v', '3v3'];
    return order.filter((k) => pin.accepts.includes(k)).flatMap((k) => pins.filter((p) => has(p, k)));
  }
  const bus = pin.accepts.find((k) => BUS_KINDS.has(k));
  if (bus) return pins.filter((p) => has(p, bus));
  const cost = (p) => (has(p, 'pwm') ? 1 : 0) + (has(p, 'analog') ? 2 : 0) + (has(p, 'sda') || has(p, 'scl') ? 4 : 0);
  return pins.filter((p) => pin.accepts.some((k) => has(p, k))).sort((a, b) => cost(a) - cost(b) || pins.indexOf(a) - pins.indexOf(b));
}

// Wires every unwired pin of `partId` to the board (the first one, or `boardId`). Shared pins are only
// power, ground and the I2C bus; a signal takes a free pin. -> { design, added: [wire], missing: [pin id] }
export function autoWire(design, partId, boardId = null) {
  const part = design.parts.find((p) => p.id === partId);
  const spec = part && componentOf(part.type);
  const board = design.parts.find((p) => (boardId ? p.id === boardId : componentOf(p.type)?.kind === 'board'));
  if (!spec || spec.kind !== 'part' || !board) return { design, added: [], missing: spec?.pins.map((p) => p.id) ?? [] };
  const boardSpec = componentOf(board.type);
  const used = () => new Set(design.wires.flatMap((w) => [w.from, w.to]).filter((e) => e.part === board.id).map((e) => e.pin));
  const wired = (pinId) => design.wires.some((w) => sameEnd(w.from, { part: part.id, pin: pinId }) || sameEnd(w.to, { part: part.id, pin: pinId }));
  const added = [];
  const missing = [];
  let next = design;
  for (const pin of spec.pins) {
    if (wired(pin.id)) continue;
    const shared = pin.accepts.some((k) => POWER_KINDS.has(k) || k === 'gnd' || BUS_KINDS.has(k));
    const taken = used();
    const target = candidatesFor(pin, boardSpec).find((p) => shared || !taken.has(p.id));
    if (!target) { missing.push(pin.id); continue; }
    const result = connect(next, { part: part.id, pin: pin.id }, { part: board.id, pin: target.id });
    if (!result.ok) { missing.push(pin.id); continue; }
    next = result.design;
    added.push(next.wires.at(-1));
    design = next;
  }
  return { design: next, added, missing };
}

// A short text of the bench for the agent's prompt and MCP answers: one line per part with its wires
export function describeDesign(design) {
  if (!design.parts.length) return '(banco vacío)';
  return design.parts.map((p) => {
    const links = design.wires
      .filter((w) => w.from.part === p.id || w.to.part === p.id)
      .map((w) => (w.from.part === p.id ? `${w.from.pin}→${w.to.part}.${w.to.pin}` : `${w.to.pin}→${w.from.part}.${w.from.pin}`));
    return `${p.id} (${p.type})${links.length ? `: ${links.join(', ')}` : ''}`;
  }).join('\n');
}
