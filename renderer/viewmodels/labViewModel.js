// Screen state of the Arduino lab (docs/features/laboratorio/README.md): the design on the bench, what is
// selected or being wired, the checker's verdict, the simulation clock and the printable enclosure.
// The design lives in `laboratorio/circuito.json`; it is loaded when a project opens, saved after changes
// (debounced; at once when a drag ends) and reloaded when someone else (the agent) changes the file.
// The engines (simulate, sketchFor, enclosureFor, toStl, toScad) are injected, and each one is optional.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import {
  DESIGN_FILE, emptyDesign, parseDesign, serializeDesign, addPart, movePart, rotatePart, removePart,
  connect, disconnect, checkDesign, autoWire,
} from '../models/circuitModel.js';
import { catalogSections, componentOf } from '../models/componentCatalog.js';
import { freeSpot } from './labLayout.js';

export const SAVE_DELAY_MS = 400;

const L = strings.lab;
const nameOf = (type) => L.parts[type]?.name ?? type;
const sectionsFor = (query) => catalogSections(query, (c) => nameOf(c.id));
// The file as main would write it (wires renumbered), to tell our own save from someone else's change
const normalized = (text) => serializeDesign(parseDesign(text).design);
const IDLE_SIM = { running: false, t: 0 };

// Bytes -> base64 (an ArrayBuffer or a typed array), in chunks so big STL files do not overflow the stack
export function toBase64(buffer) {
  const bytes = ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export class LabViewModel {
  #service;
  #engines;
  #saveTimer = null;
  #lastSaved = null; // normalized text of the last design loaded from or written to disk
  #generation = 0;   // bumps with each project: late answers of an older project are dropped

  // open: a project is open; loaded: its design has been read
  // wiring: first pin picked, waiting for the second; hover: the pin under the cursor
  // sim: { running, t } (ms since it started); simState: simulate(design, t) while running, else null
  // enclosure: { visible, exploded, data } with data = enclosureFor(design)
  store = new Observable({
    open: false, loaded: false, design: emptyDesign(), check: checkDesign(emptyDesign()),
    selected: null, wiring: null, hover: null, query: '', sections: sectionsFor(''), notice: null,
    sim: IDLE_SIM, simState: null, enclosure: { visible: false, exploded: false, data: null },
  });

  constructor({ projectModel, labService, bus = null, engines = {} }) {
    this.#service = labService;
    this.#engines = engines ?? {};
    bus?.on(EVENTS.diskChanged, ({ paths }) => this.onDiskChanged(paths));
    projectModel.store.subscribe((state, previous) => {
      if (!previous || state.session !== previous.session || state.open !== previous.open) this.#projectChanged(state);
    }, { immediate: true });
  }

  // The orchestrator can hand over engines loaded later (dynamic import)
  setEngines(engines) {
    this.#engines = { ...this.#engines, ...engines };
  }

  clearNotice() {
    if (this.store.state.notice) this.store.set({ notice: null });
  }

  // --- Parts ---

  // -> the new part's id, or null (no project yet, unknown type, full bench)
  add(type, at = null) {
    const { design, loaded } = this.store.state;
    if (!loaded) return null;
    const spot = freeSpot(design, type, at?.x ?? 0, at?.z ?? 0);
    const result = addPart(design, type, spot);
    if (!result.id) return null;
    this.#commit(result.design, { selected: result.id });
    return result.id;
  }

  // Live while dragging: the checker does not depend on positions, so it is not run again
  move(id, { x, z }) {
    const { design, loaded } = this.store.state;
    if (!loaded || !design.parts.some((p) => p.id === id)) return;
    this.store.set({ design: movePart(design, id, { x, z }) });
    this.#scheduleSave();
  }

  moveEnd() {
    if (!this.store.state.loaded) return;
    this.#refreshEnclosure();
    this.#saveNow();
  }

  rotate(id = this.store.state.selected) {
    const { design } = this.store.state;
    if (!id || !design.parts.some((p) => p.id === id)) return;
    this.#commit(rotatePart(design, id));
  }

  remove(id = this.store.state.selected) {
    const { design } = this.store.state;
    if (!id || !design.parts.some((p) => p.id === id)) return;
    this.#commit(removePart(design, id));
  }

  select(id) {
    const exists = id && this.store.state.design.parts.some((p) => p.id === id);
    this.store.set({ selected: exists ? id : null });
  }

  // --- Wires ---

  // First pick waits for the second; a pin of another part connects; the same pin cancels
  pickPin(part, pin) {
    const { design, wiring, loaded } = this.store.state;
    const target = design.parts.find((p) => p.id === part);
    if (!loaded || !target || !componentOf(target.type)?.pins.some((p) => p.id === pin)) return;
    if (wiring && wiring.part === part && wiring.pin === pin) { this.cancelWire(); return; }
    if (!wiring || wiring.part === part) {
      this.store.set({ wiring: { part, pin }, notice: { kind: 'ok', text: L.bench.wiring(nameOf(target.type), pin) } });
      return;
    }
    const result = connect(design, wiring, { part, pin });
    if (!result.ok) {
      this.store.set({ wiring: null, notice: { kind: 'warn', text: L.bench.connectRefused[result.reason] ?? L.bench.connectRefused.unknown } });
      return;
    }
    this.store.set({ wiring: null, notice: null });
    this.#commit(result.design);
  }

  setHover(part = null, pin = null) {
    const next = part && pin ? { part, pin } : null;
    const current = this.store.state.hover;
    if (current?.part === next?.part && current?.pin === next?.pin) return;
    this.store.set({ hover: next });
  }

  cancelWire() {
    if (!this.store.state.wiring) return;
    this.store.set({ wiring: null, notice: null });
  }

  // Wires the given part to the board, or every part when none is given (a board id wires all to it)
  autoWire(id = null) {
    const { design, loaded } = this.store.state;
    if (!loaded) return;
    const kindOf = (p) => componentOf(p.type)?.kind;
    if (!design.parts.some((p) => kindOf(p) === 'board')) {
      this.store.set({ notice: { kind: 'warn', text: L.bench.noBoardForWire } });
      return;
    }
    const picked = id ? design.parts.find((p) => p.id === id) : null;
    if (id && !picked) return;
    const boardId = picked && kindOf(picked) === 'board' ? picked.id : null;
    const targets = picked && !boardId ? [picked] : design.parts.filter((p) => kindOf(p) === 'part');
    let next = design;
    let added = 0;
    const missing = [];
    for (const part of targets) {
      const result = autoWire(next, part.id, boardId);
      next = result.design;
      added += result.added.length;
      missing.push(...result.missing.map((pin) => `${nameOf(part.type)} ${pin}`));
    }
    const notice = missing.length
      ? { kind: 'warn', text: L.bench.autoWireMissing(missing) }
      : { kind: 'ok', text: L.bench.autoWired(added) };
    if (next !== design) this.#commit(next);
    this.store.set({ notice });
  }

  removeWire(id) {
    const { design } = this.store.state;
    if (!design.wires.some((w) => w.id === id)) return;
    this.#commit(disconnect(design, id));
  }

  setQuery(query) {
    const q = String(query ?? '');
    this.store.set({ query: q, sections: sectionsFor(q) });
  }

  // Esc: cancel the wire in progress, else deselect, else stop the simulation. -> whether it did something
  escape() {
    const { wiring, selected, sim } = this.store.state;
    if (wiring) { this.cancelWire(); return true; }
    if (selected) { this.select(null); return true; }
    if (sim.running) { this.#stopSim(); return true; }
    return false;
  }

  // --- Simulation ---

  toggleSim() {
    const { sim, check, design } = this.store.state;
    if (sim.running) { this.#stopSim(); return; }
    if (check.level === 'red') {
      this.store.set({ notice: { kind: 'error', text: L.sim.blocked } });
      return;
    }
    this.store.set({ sim: { running: true, t: 0 }, simState: this.#simulate(design, 0), notice: null });
  }

  // The view calls this every frame while sim.running (dt in ms)
  tick(dt) {
    const { sim, design } = this.store.state;
    if (!sim.running) return;
    const t = sim.t + dt;
    this.store.set({ sim: { running: true, t }, simState: this.#simulate(design, t) });
  }

  // --- Printable enclosure and code ---

  toggleEnclosure() {
    const { enclosure, design } = this.store.state;
    if (enclosure.visible) {
      this.store.set({ enclosure: { ...enclosure, visible: false, exploded: false } });
      return;
    }
    const data = this.#enclosureOf(design);
    if (!data) return;
    this.store.set({ enclosure: { visible: true, exploded: false, data } });
  }

  toggleExplode() {
    const { enclosure } = this.store.state;
    if (!enclosure.visible) return;
    this.store.set({ enclosure: { ...enclosure, exploded: !enclosure.exploded } });
  }

  // kind: 'stl' (sent as base64) | 'scad' -> whether the file was saved
  async exportEnclosure(kind) {
    if (kind !== 'stl' && kind !== 'scad') return false;
    const make = kind === 'stl' ? this.#engines.toStl : this.#engines.toScad;
    const data = typeof make === 'function' ? this.#enclosureOf(this.store.state.design) : null;
    if (!data) { if (typeof make !== 'function') this.#notReady(); return false; }
    let content;
    try {
      content = kind === 'stl' ? toBase64(make(data)) : String(make(data));
    } catch {
      this.#exportFailed();
      return false;
    }
    return this.#export(kind, content, L.enclosure.saved);
  }

  async exportSketch() {
    if (typeof this.#engines.sketchFor !== 'function') { this.#notReady(); return false; }
    let sketch;
    try { sketch = this.#engines.sketchFor(this.store.state.design); } catch { sketch = null; }
    if (!sketch?.ok || typeof sketch.code !== 'string') {
      this.store.set({ notice: { kind: 'warn', text: sketch && sketch.reason !== 'noBoard' ? L.viewModel.notReady : L.sketch.noBoard } });
      return false;
    }
    return this.#export('ino', sketch.code, L.sketch.saved);
  }

  // --- Disk ---

  // Reloads when the design file changed and it was not our own save
  async onDiskChanged(paths = []) {
    if (!paths.some((p) => p === DESIGN_FILE || String(p).endsWith(`/${DESIGN_FILE}`))) return;
    const { open, loaded } = this.store.state;
    if (!open || !loaded) return;
    const generation = this.#generation;
    const response = await this.#service.load();
    if (generation !== this.#generation || !response?.ok) return;
    const text = typeof response.data === 'string' ? response.data : null;
    const norm = text === null ? normalized(serializeDesign(emptyDesign())) : normalized(text);
    if (norm === this.#lastSaved) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    this.#lastSaved = norm;
    this.#commit(text === null ? emptyDesign() : parseDesign(text).design, { dirty: false });
  }

  // --- Internals ---

  #projectChanged({ open }) {
    const generation = ++this.#generation;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    this.#lastSaved = null;
    const design = emptyDesign();
    this.store.set({
      open, loaded: false, design, check: checkDesign(design), selected: null, wiring: null, hover: null,
      notice: null, sim: IDLE_SIM, simState: null, enclosure: { visible: false, exploded: false, data: null },
    });
    if (open) this.#load(generation);
  }

  async #load(generation) {
    let response;
    try { response = await this.#service.load(); } catch { response = null; }
    if (generation !== this.#generation) return;
    const text = response?.ok && typeof response.data === 'string' ? response.data : null;
    const parsed = text === null ? { design: emptyDesign(), dropped: 0 } : parseDesign(text);
    this.#lastSaved = normalized(serializeDesign(parsed.design));
    this.store.set({
      loaded: true, design: parsed.design, check: checkDesign(parsed.design),
      notice: parsed.dropped ? { kind: 'warn', text: L.bench.loadFailed } : null,
    });
  }

  // Applies a new design: re-checks it, keeps selection and wiring only while their parts exist, refreshes what
  // depends on the design (simulation, enclosure) and schedules the save (dirty: false for a design from disk)
  #commit(design, { selected = this.store.state.selected, dirty = true } = {}) {
    const has = (id) => design.parts.some((p) => p.id === id);
    const { wiring, hover } = this.store.state;
    const check = checkDesign(design);
    this.store.set({
      design, check,
      selected: has(selected) ? selected : null,
      wiring: wiring && has(wiring.part) ? wiring : null,
      hover: hover && has(hover.part) ? hover : null,
    });
    this.#refreshSim();
    this.#refreshEnclosure();
    if (dirty) this.#scheduleSave();
  }

  #refreshSim() {
    const { sim, check, design } = this.store.state;
    if (!sim.running) return;
    if (check.level === 'red') {
      this.store.set({ sim: IDLE_SIM, simState: null, notice: { kind: 'error', text: L.sim.blocked } });
      return;
    }
    this.store.set({ simState: this.#simulate(design, sim.t) });
  }

  #refreshEnclosure() {
    const { enclosure, design } = this.store.state;
    if (!enclosure.visible) return;
    const data = this.#call('enclosureFor', design);
    if (data?.ok) this.store.set({ enclosure: { ...enclosure, data } });
    else this.store.set({ enclosure: { visible: false, exploded: false, data: data ?? null } });
  }

  #stopSim() {
    this.store.set({ sim: IDLE_SIM, simState: null });
  }

  #simulate(design, t) {
    return this.#call('simulate', design, t) ?? null;
  }

  // Runs an engine when it exists; a missing or failing engine gives undefined
  #call(name, ...args) {
    const engine = this.#engines[name];
    if (typeof engine !== 'function') return undefined;
    try { return engine(...args); } catch { return undefined; }
  }

  // The enclosure's data, or null after telling the person why there is none
  #enclosureOf(design) {
    if (typeof this.#engines.enclosureFor !== 'function') { this.#notReady(); return null; }
    const data = this.#call('enclosureFor', design);
    if (!data?.ok) {
      this.store.set({ notice: { kind: 'warn', text: data && data.reason !== 'noBoard' ? L.viewModel.notReady : L.enclosure.noBoard } });
      return null;
    }
    return data;
  }

  async #export(kind, content, savedText) {
    let result;
    try { result = await this.#service.exportFile(kind, content); } catch { result = null; }
    if (!result?.ok) { this.#exportFailed(); return false; }
    this.store.set({ notice: { kind: 'ok', text: savedText(result.data?.file ?? '') } });
    return true;
  }

  #notReady() {
    this.store.set({ notice: { kind: 'warn', text: L.viewModel.notReady } });
  }

  #exportFailed() {
    this.store.set({ notice: { kind: 'error', text: L.viewModel.exportFailed } });
  }

  #scheduleSave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#saveNow(), SAVE_DELAY_MS);
  }

  async #saveNow() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    const { design, loaded } = this.store.state;
    if (!loaded) return;
    const generation = this.#generation;
    const text = serializeDesign(design);
    this.#lastSaved = normalized(text);
    let result;
    try { result = await this.#service.save(text); } catch { result = null; }
    if (generation !== this.#generation || result?.ok) return;
    this.store.set({ notice: { kind: 'error', text: L.bench.saveFailed } });
  }
}
