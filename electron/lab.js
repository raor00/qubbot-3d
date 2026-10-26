// The lab's main-process side (docs/features/laboratorio/CONTRATOS.md): the design file, the exports and
// the agent's lab tools. CommonJS; the shared rules (circuitModel, catalog, layout) are ES modules of the
// renderer, loaded with import(). The agent proposes, circuitModel.checkDesign decides: a connection that
// would turn the circuit red is refused here, whoever asks. Tested in lab.test.js.
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const t = require('./strings');

const DESIGN_FILE = 'laboratorio/circuito.json';
// The only files the window may export, by kind
const EXPORT_FILES = Object.freeze({
  stl: 'laboratorio/caja.stl',
  scad: 'laboratorio/caja.scad',
  ino: 'laboratorio/circuito/circuito.ino',
});
const LAB_TOOLS = ['lab_catalog', 'lab_view', 'lab_add_part', 'lab_connect', 'lab_auto_wire', 'lab_remove'];
const LAB_WRITE_TOOLS = ['lab_add_part', 'lab_connect', 'lab_auto_wire', 'lab_remove'];

const MAX_DESIGN_BYTES = 200 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024; // .scad and .ino
const MAX_STL_BASE64 = 28 * 1024 * 1024; // about 20 MB of STL
const MAX_ISSUES = 12;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// --- The renderer's modules, loaded once ---
let modelsPromise = null;
function models() {
  if (!modelsPromise) {
    const load = (rel) => import(pathToFileURL(path.join(__dirname, '..', 'renderer', rel)).href);
    modelsPromise = Promise.all([load('models/circuitModel.js'), load('models/componentCatalog.js'), load('viewmodels/labLayout.js'), load('i18n/lab.es.js')])
      .then(([circuit, catalog, layout, strings]) => ({ circuit, catalog, layout, text: strings.lab }))
      .catch((err) => { modelsPromise = null; throw err; });
  }
  return modelsPromise;
}

// --- The design file ---

// Text -> { text, dropped, design }: parsed and written again canonically; anything unknown is dropped
async function normalizeDesign(raw) {
  if (typeof raw !== 'string') throw new Error(t.mcp.lab.badDesign);
  if (Buffer.byteLength(raw) > MAX_DESIGN_BYTES) throw new Error(t.mcp.lab.tooBig);
  let plain;
  try { plain = JSON.parse(raw); } catch { throw new Error(t.mcp.lab.badDesign); }
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)) throw new Error(t.mcp.lab.badDesign);
  const { circuit } = await models();
  const { design, dropped, error } = circuit.parseDesign(raw);
  if (error) throw new Error(t.mcp.lab.badDesign);
  return { text: circuit.serializeDesign(design), dropped, design };
}

// guard(abs): the caller's check of where the path really lands (secrets, links); it throws to refuse
async function loadDesignText(workspace, { guard } = {}) {
  if (!(await workspace.exists(DESIGN_FILE))) return null;
  const abs = await workspace.resolve(DESIGN_FILE);
  await guard?.(abs);
  if ((await fsp.stat(abs)).size > MAX_DESIGN_BYTES) throw new Error(t.mcp.lab.tooBig);
  return workspace.readFile(DESIGN_FILE);
}

// The bench on disk; an empty one when there is no file or it cannot be read
async function readDesign(workspace, opts) {
  const { circuit } = await models();
  const text = await loadDesignText(workspace, opts);
  const parsed = text == null ? null : circuit.parseDesign(text);
  return parsed && !parsed.error ? parsed.design : circuit.emptyDesign();
}

// Validates, re-serializes and writes ONLY laboratorio/circuito.json (the person's own bench: no dialog)
async function saveDesign(workspace, raw, { guard } = {}) {
  const { text, dropped } = await normalizeDesign(raw);
  const abs = await workspace.resolve(DESIGN_FILE);
  await guard?.(abs);
  await workspace.writeFile(DESIGN_FILE, text);
  return { dropped };
}

// kind: 'stl' (content in base64, written as bytes) | 'scad' | 'ino' (text) -> { file }
async function exportFile(workspace, kind, content, { guard } = {}) {
  if (typeof kind !== 'string' || !Object.hasOwn(EXPORT_FILES, kind)) throw new Error(t.mcp.lab.badExport);
  if (typeof content !== 'string' || !content) throw new Error(t.mcp.lab.badContent);
  const rel = EXPORT_FILES[kind];
  const binary = kind === 'stl';
  if (binary ? content.length > MAX_STL_BASE64 : Buffer.byteLength(content) > MAX_TEXT_BYTES) throw new Error(t.mcp.lab.tooBig);
  if (binary && (!BASE64.test(content) || content.length % 4 === 1)) throw new Error(t.mcp.lab.badContent);
  const abs = await workspace.resolve(rel);
  await guard?.(abs);
  if (binary) {
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, Buffer.from(content, 'base64'));
  } else {
    await workspace.writeFile(rel, content);
  }
  return { file: rel };
}

// --- The agent's tools: compute the new design, never touch the disk ---

const needString = (args, key) => {
  if (typeof args?.[key] !== 'string' || !args[key].trim()) throw new Error(t.mcp.lab.needArg(key));
  return args[key].trim();
};

// 'hc-sr04-1.TRIG' -> { part, pin } (the pin is after the last dot)
function parseEnd(text) {
  const dot = text.lastIndexOf('.');
  if (dot <= 0 || dot === text.length - 1) throw new Error(t.mcp.lab.badEnd(text));
  return { part: text.slice(0, dot), pin: text.slice(dot + 1) };
}

const issueLine = (text, issue) => {
  const make = text.check.issues[issue.key];
  const args = {
    overvoltage: [issue.part], undervoltage: [issue.part],
    missing: [issue.part, issue.pin], wrongPin: [issue.part, issue.pin], level: [issue.part, issue.pin],
    pinShared: [issue.part, issue.pin, issue.boardPin], budget: [issue.part, issue.usedMa, issue.budgetMa],
  }[issue.key] ?? [];
  return make ? make(...args) : issue.key;
};

// The checker's findings in plain Spanish, red first
function checkText(m, design) {
  if (!design.parts.length) return '';
  const { issues } = m.circuit.checkDesign(design);
  if (!issues.length) return m.text.check.ok;
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  const lines = sorted.slice(0, MAX_ISSUES).map((i) => `- [${t.mcp.lab.level[i.level]}] ${issueLine(m.text, i)}`);
  if (sorted.length > MAX_ISSUES) lines.push(t.mcp.lab.moreIssues(sorted.length - MAX_ISSUES));
  return [t.mcp.lab.checkTitle, ...lines].join('\n');
}

const redCount = (m, design) => m.circuit.checkDesign(design).issues.filter((i) => i.level === 'red').length;
const nameOf = (m, type) => m.text.parts[type]?.name ?? type;

// What the agent reads back after a tool: what happened, the bench and the checker's findings
function bench(m, design, headline) {
  const names = design.parts.map((p) => `${nameOf(m, p.type)} (${p.id})`).join(', ');
  return [
    headline,
    t.mcp.lab.benchTitle,
    m.circuit.describeDesign(design),
    design.parts.length ? `${t.mcp.lab.names(names)} ${t.mcp.lab.wireCount(design.wires.length)}` : t.mcp.lab.emptyHint,
    checkText(m, design),
  ].filter(Boolean).join('\n');
}

function catalogText(m) {
  const lines = m.catalog.COMPONENTS.map((c) => {
    const power = c.kind === 'board'
      ? [t.mcp.lab.boardSignal(c.logic), t.mcp.lab.boardGives(c.budgetMa)]
      : [c.supplies ? t.mcp.lab.supplies(c.supplies) : m.text.catalog.volts(c.volts), t.mcp.lab.draws(c.mA ?? 0)];
    return [c.id, nameOf(m, c.id), m.text.categories[c.category] ?? c.category, ...power, t.mcp.lab.pins(c.pins.map((p) => p.id).join(', '))].join(' · ');
  });
  return [t.mcp.lab.catalogIntro, ...lines].join('\n');
}

const unchanged = (design, reply) => ({ design, reply, changed: false });
const changedTo = (m, design, reason, headline) => ({
  design, reply: bench(m, design, headline), changed: true, reason, text: m.circuit.serializeDesign(design),
});

// name: lab_* or platanus_lab_*; args: what the agent sent; design: the bench now.
// -> { design, reply, changed, reason?, text? }: for a change, `text` is the new file and `reason` tells the
// person why (main saves it through the same path as platanus_write_file); a refusal throws a plain-Spanish error
async function applyLabTool(name, args, design) {
  const tool = String(name ?? '').replace(/^platanus_/, '');
  if (!LAB_TOOLS.includes(tool)) throw new Error(t.mcp.lab.unknownTool(tool));
  const m = await models();
  const { circuit, catalog } = m;
  const partOf = (id) => design.parts.find((p) => p.id === id);

  if (tool === 'lab_catalog') return unchanged(design, catalogText(m));
  if (tool === 'lab_view') return unchanged(design, bench(m, design, ''));

  if (tool === 'lab_add_part') {
    const type = needString(args, 'type');
    if (!catalog.componentOf(type)) throw new Error(t.mcp.lab.unknownType(type));
    let at = { x: 0, z: 0 };
    if (args.near != null) {
      const near = partOf(needString(args, 'near'));
      if (!near) throw new Error(t.mcp.lab.unknownPart(args.near));
      at = { x: near.x, z: near.z };
    }
    const spot = m.layout.freeSpot(design, type, at.x, at.z);
    const added = circuit.addPart(design, type, spot);
    if (!added.id) throw new Error(t.mcp.lab.benchFull);
    return changedTo(m, added.design, t.mcp.lab.reasonAdd(nameOf(m, type)), t.mcp.lab.added(nameOf(m, type), added.id));
  }

  if (tool === 'lab_connect') {
    const fromText = needString(args, 'from');
    const toText = needString(args, 'to');
    const from = parseEnd(fromText);
    const to = parseEnd(toText);
    const result = circuit.connect(design, from, to);
    if (!result.ok) throw new Error(t.mcp.lab.refusedEnds(m.text.bench.connectRefused[result.reason] ?? m.text.bench.connectRefused.unknown, fromText, toText));
    // The checker decides: a wire that adds a red finding is not made
    if (redCount(m, result.design) > redCount(m, design)) {
      const reds = checkText(m, result.design).split('\n').filter((l) => l.startsWith('- [rojo]')).join('\n');
      throw new Error(t.mcp.lab.redRefused(reds));
    }
    return changedTo(m, result.design, t.mcp.lab.reasonConnect(fromText, toText), t.mcp.lab.connected(result.id, fromText, toText));
  }

  if (tool === 'lab_auto_wire') {
    const id = args?.part == null ? null : needString(args, 'part');
    const target = id && partOf(id);
    if (id && !target) throw new Error(t.mcp.lab.unknownPart(id));
    if (target && catalog.componentOf(target.type).kind === 'board') throw new Error(t.mcp.lab.boardNeedsNoWire(id));
    if (!design.parts.some((p) => catalog.componentOf(p.type).kind === 'board')) throw new Error(m.text.bench.noBoardForWire);
    const ids = id ? [id] : design.parts.filter((p) => catalog.componentOf(p.type).kind === 'part').map((p) => p.id);
    let next = design;
    let added = 0;
    const missing = [];
    for (const partId of ids) {
      const result = circuit.autoWire(next, partId);
      next = result.design;
      added += result.added.length;
      missing.push(...result.missing.map((pin) => `${partId}.${pin}`));
    }
    const headline = [m.text.bench.autoWired(added), missing.length ? m.text.bench.autoWireMissing(missing) : ''].filter(Boolean).join(' ');
    if (!added) return unchanged(design, bench(m, design, headline));
    return changedTo(m, next, t.mcp.lab.reasonAutoWire(added), headline);
  }

  // lab_remove: one part (with its wires) or one wire
  const partId = args?.part == null ? null : needString(args, 'part');
  const wireId = args?.wire == null ? null : needString(args, 'wire');
  if (!partId && !wireId) throw new Error(t.mcp.lab.needTarget);
  if (partId && wireId) throw new Error(t.mcp.lab.bothTargets);
  if (partId) {
    const part = partOf(partId);
    if (!part) throw new Error(t.mcp.lab.unknownPart(partId));
    const wires = design.wires.filter((w) => w.from.part === partId || w.to.part === partId).length;
    const label = nameOf(m, part.type);
    return changedTo(m, circuit.removePart(design, partId), t.mcp.lab.reasonRemovePart(label), t.mcp.lab.removedPart(label, partId, wires));
  }
  if (!design.wires.some((w) => w.id === wireId)) throw new Error(t.mcp.lab.unknownWire(wireId));
  return changedTo(m, circuit.disconnect(design, wireId), t.mcp.lab.reasonRemoveWire(wireId), t.mcp.lab.removedWire(wireId));
}

// One task at a time, in order (a failure does not stop the next ones): the agent's lab tools read the
// bench, may wait for the person's approval and write it back, so two at once would overwrite each other
function createQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}

module.exports = {
  DESIGN_FILE, EXPORT_FILES, LAB_TOOLS, LAB_WRITE_TOOLS, MAX_DESIGN_BYTES,
  normalizeDesign, loadDesignText, readDesign, saveDesign, exportFile, applyLabTool, createQueue,
};
