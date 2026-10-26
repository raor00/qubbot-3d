// The bench's floating toolbar (bottom center of the stage, only in the lab view): simulate, wire for me,
// the enclosure menu, make the code and, with a part selected, rotate / remove. Also the short notices
// (labViewModel.store.notice, gone after 3 s) and the hint while a wire is being drawn.
// Only draws the two stores and forwards clicks to labViewModel.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { createFloatingMenu } from './floatingMenu.js';
import { partLabel, enclosureFacts } from './catalogItems.js';

const L = strings.lab;
export const NOTICE_MS = 3000;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// danger: destructive, so the hand cursor never triggers it by holding still (data-gesture="never")
function button({ label, iconName, onClick, primary = false, danger = false, className = '' }) {
  const b = el('button', `lab-btn${primary ? ' primary' : ''}${danger ? ' danger' : ''} ${className}`.trim());
  b.type = 'button';
  b.dataset.gesture = danger ? 'never' : 'safe';
  if (iconName) {
    const mark = el('span', 'lab-btn-icon');
    mark.setAttribute('aria-hidden', 'true');
    mark.append(icon(iconName, { size: 16 }));
    b.append(mark);
  }
  b.append(el('span', 'lab-btn-label', label));
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
  return b;
}

// stage: the map's container (holds #lab-toolbar, or gets one); appViewModel.store.state.view === 'lab' shows it
export function createLabToolbarView({ stage, labViewModel: vm, appViewModel }) {
  let root = stage.querySelector('#lab-toolbar');
  if (!root) {
    root = el('div', 'lab-toolbar');
    root.id = 'lab-toolbar';
    stage.append(root);
  }
  root.classList.add('lab-toolbar');

  const hint = el('p', 'lab-hint');
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  const toast = el('p', 'lab-toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  const pill = el('div', 'lab-pill');
  pill.setAttribute('role', 'toolbar');
  pill.setAttribute('aria-label', L.panel.toolbar);
  root.append(hint, toast, pill);

  // --- Enclosure menu: the floating layer, above the pill ---
  let menuOpen = false;
  let menuAnchor = null;
  let boxButton = null;
  const expanded = () => boxButton?.setAttribute('aria-expanded', String(menuOpen));
  const closeMenu = () => { menuOpen = false; menu.hide(); expanded(); };
  const menu = createFloatingMenu({ id: 'lab-enclosure-menu', label: L.enclosure.title, onDismiss: closeMenu });
  const menuEntries = () => {
    const { enclosure } = vm.store.state;
    const facts = enclosureFacts(enclosure);
    const done = (run) => () => { closeMenu(); run(); };
    return [
      ...(facts ? [{ heading: facts.size }, { heading: facts.print }] : enclosure?.data && !enclosure.data.ok ? [{ heading: L.enclosure.noBoard }] : []),
      ...(facts || enclosure?.data ? [{ separator: true }] : []),
      { label: enclosure?.visible ? L.enclosure.hide : L.enclosure.show, run: done(() => vm.toggleEnclosure()) },
      { label: L.enclosure.explode, run: done(() => vm.toggleExplode()) },
      { label: L.enclosure.exportStl, run: done(() => vm.exportEnclosure('stl')) },
      { label: L.enclosure.exportScad, run: done(() => vm.exportEnclosure('scad')) },
    ];
  };
  const showMenu = (anchor) => { menuOpen = true; menuAnchor = anchor; menu.show('enclosure', anchor, menuEntries()); expanded(); };
  document.addEventListener('click', (e) => {
    if (menuOpen && !menu.contains(e.target) && !menuAnchor?.contains(e.target)) closeMenu();
  });
  window.addEventListener('resize', () => menu.position());

  // --- The pill: rebuilt only when something it shows changed (sim.t changes every frame) ---
  let pillKey = null;
  function drawPill(state) {
    const { design, selected, sim, enclosure } = state;
    const part = selected && design?.parts?.find((p) => p.id === selected) ? selected : null;
    const key = [sim?.running, part, part && partLabel(design, part), enclosure?.visible, enclosure?.exploded].join('|');
    if (key === pillKey) return;
    pillKey = key;
    const running = Boolean(sim?.running);

    const simulate = button({ label: running ? L.sim.stop : L.sim.start, iconName: running ? 'stop' : 'play', primary: true, className: running ? 'running' : '', onClick: () => vm.toggleSim() });
    simulate.setAttribute('aria-pressed', String(running));
    if (running) simulate.prepend(el('span', 'lab-pulse'));

    const box = button({ label: L.panel.enclosure, iconName: 'cube', onClick: (b) => (menuOpen ? closeMenu() : showMenu(b)) });
    box.setAttribute('aria-haspopup', 'menu');
    box.setAttribute('aria-controls', 'lab-enclosure-menu');
    box.setAttribute('aria-expanded', String(menuOpen));
    box.classList.toggle('on', Boolean(enclosure?.visible));

    const nodes = [
      simulate,
      button({ label: L.bench.autoWire, iconName: 'plug', onClick: () => vm.autoWire() }),
      box,
      button({ label: L.sketch.make, iconName: 'code', onClick: () => vm.exportSketch() }),
    ];
    if (part) {
      const name = el('span', 'lab-sel-name', partLabel(design, part));
      name.title = L.bench.selected(partLabel(design, part));
      nodes.push(el('span', 'lab-sep'), name,
        button({ label: L.bench.rotate, iconName: 'rotate', onClick: () => vm.rotate(part) }),
        button({ label: L.bench.remove, iconName: 'trash', danger: true, onClick: () => vm.remove(part) }));
    }
    const refocus = pill.contains(document.activeElement) ? [...pill.children].findIndex((n) => n === document.activeElement) : -1;
    pill.replaceChildren(...nodes);
    if (refocus >= 0 && nodes[refocus]) nodes[refocus].focus({ preventScroll: true });
    boxButton = box;
    if (menuOpen) menuAnchor = box;
  }

  // --- Wiring hint ---
  function drawHint(state) {
    const w = state.wiring;
    hint.hidden = !w;
    hint.textContent = w ? L.bench.wiring(partLabel(state.design, w.part), w.pin) : '';
  }

  // --- Notice: shows when a new one arrives, hides itself after 3 s (the store keeps it; we only stop showing it) ---
  let shownNotice = null;
  let timer = null;
  function drawNotice(state) {
    const n = state.notice;
    if (!n || n === shownNotice) return;
    shownNotice = n;
    toast.textContent = n.text;
    toast.dataset.kind = n.kind ?? 'ok';
    toast.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('on'), NOTICE_MS);
  }

  function draw() {
    const state = vm.store.state;
    const visible = appViewModel.store.state.view === 'lab' && Boolean(state.open);
    root.hidden = !visible;
    if (!visible) {
      if (menuOpen) closeMenu();
      return;
    }
    drawPill(state);
    drawHint(state);
    drawNotice(state);
    if (menuOpen) menu.show('enclosure', menuAnchor, menuEntries());
  }

  vm.store.subscribe(draw);
  appViewModel.store.subscribe(draw);
  draw();

  return {
    destroy() { clearTimeout(timer); closeMenu(); root.replaceChildren(); },
  };
}
