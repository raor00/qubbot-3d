// The lab's side panel (where the explorer used to be): a search box, the component catalog in sections of
// draggable cards, and below it "Revisión del circuito" with the checker's findings.
// Only draws labViewModel.store and forwards clicks. The search box and the lists are created once per view
// model and updated in place, so typing keeps focus and caret and a drag in progress is never cut by a redraw.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import {
  CATEGORY_ICONS, PART_MIME, colorHex, partChips, nameOf, partName, issueRows, reviewSummary, sectionsOf,
} from './catalogItems.js';
import { noteDragStart, noteDragEnd } from './labDropView.js';

const L = strings.lab;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function card(spec, labViewModel) {
  const name = nameOf(spec);
  const button = el('button', 'lab-card');
  button.type = 'button';
  button.draggable = true;
  button.dataset.part = spec.id;
  button.dataset.gesture = 'safe';
  button.setAttribute('aria-label', L.catalog.add(name));
  button.title = L.catalog.add(name);
  button.style.setProperty('--part', colorHex(spec.color));

  const tile = el('span', 'lab-card-icon');
  tile.setAttribute('aria-hidden', 'true');
  tile.innerHTML = CATEGORY_ICONS[spec.category] ?? CATEGORY_ICONS.sensors; // static markup, no project data

  const text = el('span', 'lab-card-text');
  const title = el('span', 'lab-card-name');
  title.append(el('span', 'lab-swatch'), el('span', '', name));
  text.append(title, el('span', 'lab-card-desc', L.parts[spec.id]?.desc ?? ''));
  const chips = el('span', 'lab-chips');
  for (const chip of partChips(spec)) chips.append(el('span', 'lab-chip', chip));
  text.append(chips);

  button.append(tile, text);
  button.addEventListener('click', () => labViewModel.add(spec.id));
  button.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(PART_MIME, spec.id);
    e.dataTransfer.setData('text/plain', name);
    e.dataTransfer.effectAllowed = 'copy';
    noteDragStart(spec.id);
    button.classList.add('dragging');
  });
  button.addEventListener('dragend', () => {
    noteDragEnd();
    button.classList.remove('dragging');
  });
  return button;
}

function buildPanel(labViewModel, ctx) {
  const root = el('div', 'lab-catalog');
  const empty = el('p', 'lab-catalog-empty', L.catalog.noProject);

  const intro = el('p', 'lab-catalog-intro', L.catalog.intro);
  const box = el('label', 'lab-search');
  const search = el('input');
  search.type = 'search';
  search.placeholder = L.catalog.search;
  search.setAttribute('aria-label', L.catalog.search);
  search.autocomplete = 'off';
  search.spellcheck = false;
  const searchIcon = el('span', 'lab-search-icon');
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.append(icon('search', { size: 14 }));
  box.append(searchIcon, search);
  search.addEventListener('input', () => labViewModel.setQuery(search.value));

  const list = el('div', 'lab-catalog-list');
  const review = el('section', 'lab-review');
  review.setAttribute('aria-label', L.check.title);
  root.append(empty, intro, box, list, review);

  let listKey = null;
  let reviewKey = null;

  function drawList(state) {
    const sections = sectionsOf(state);
    const key = `${state.query ?? ''}|${sections.map((s) => `${s.category}:${s.items.map((c) => c.id).join(',')}`).join(';')}`;
    if (key === listKey) return;
    listKey = key;
    if (!sections.length) return list.replaceChildren(el('p', 'lab-catalog-none', L.catalog.empty));
    list.replaceChildren(...sections.map((section) => {
      const block = el('section', 'lab-section');
      const head = el('h3', 'lab-section-title', L.categories[section.category] ?? section.category);
      head.append(el('em', '', String(section.items.length)));
      const cards = el('div', 'lab-cards');
      cards.append(...section.items.map((spec) => card(spec, labViewModel)));
      block.append(head, cards);
      return block;
    }));
  }

  function drawReview(state) {
    const design = state.design;
    const rows = issueRows(design, state.check);
    const key = `${design?.parts?.length ?? 0}|${rows.map((r) => `${r.level}:${r.part}:${r.text}`).join(';')}`;
    if (key === reviewKey) return;
    reviewKey = key;
    if (!design?.parts?.length) return review.replaceChildren();

    const head = el('header', 'lab-review-head');
    head.append(el('h3', 'lab-review-title', L.check.title));
    if (!rows.length) {
      const ok = el('p', 'lab-review-ok');
      ok.append(el('span', 'lab-dot green'), el('span', '', L.check.ok));
      return review.replaceChildren(head, ok);
    }
    const { red, text } = reviewSummary(rows);
    head.append(el('span', `lab-review-count${red ? ' red' : ''}`, text));

    const items = el('ul', 'lab-issues');
    for (const row of rows) {
      const item = el('li');
      const button = el('button', `lab-issue ${row.level}`);
      button.type = 'button';
      button.dataset.gesture = 'safe';
      button.disabled = !row.part;
      if (row.part) button.title = L.panel.showPart(partName(design.parts.find((p) => p.id === row.part)?.type));
      button.append(el('span', `lab-dot ${row.level}`), el('span', 'lab-issue-text', row.text));
      if (row.part) button.addEventListener('click', () => labViewModel.select(row.part));
      item.append(button);
      items.append(item);
    }
    const fix = el('button', 'lab-fix');
    fix.type = 'button';
    fix.dataset.gesture = 'safe';
    fix.append(icon('sparkles', { size: 15 }), el('span', '', L.check.fix));
    fix.addEventListener('click', () => ctx.actions?.askAgent?.(L.prompts.review));
    review.replaceChildren(head, items, fix);
  }

  function draw() {
    const state = labViewModel.store.state;
    const open = Boolean(state.open);
    root.classList.toggle('no-project', !open);
    if (search.value !== (state.query ?? '') && document.activeElement !== search) search.value = state.query ?? '';
    drawList(state);
    drawReview(state);
  }

  labViewModel.store.subscribe(draw);
  draw();
  return { root, search, ctx };
}

const panels = new WeakMap();

// labViewModel: LabViewModel; actions: { askAgent(prompt) }. Returns the nodes for the side panel's body.
// The same nodes come back on every call (they update themselves), so a shell that re-renders keeps the
// search box's text; its focus and caret are put back right after the shell re-attaches it.
export function renderCatalog({ labViewModel, actions }) {
  let panel = panels.get(labViewModel);
  if (!panel) panels.set(labViewModel, (panel = buildPanel(labViewModel, { actions })));
  panel.ctx.actions = actions ?? panel.ctx.actions;
  const { root, search } = panel;
  if (document.activeElement === search) {
    const { selectionStart, selectionEnd } = search;
    queueMicrotask(() => {
      if (!search.isConnected || document.activeElement === search) return;
      search.focus({ preventScroll: true });
      try { search.setSelectionRange(selectionStart, selectionEnd); } catch { /* type=search may refuse */ }
    });
  }
  return [root];
}
