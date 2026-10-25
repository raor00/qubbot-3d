// What holding still may select (spec/003-hand-gestures.md, B18-B22): an allowlist in the panels, never
// text fields, nothing while a confirmation is open; 3D picks like a click.
import test from 'node:test';
import assert from 'node:assert/strict';
import { uiTarget, pickTarget } from '../../renderer/views/ui/handTargets.js';

// A tiny element: its own attributes and its parents', enough for closest()
function el({ tag = 'button', attrs = {}, text = '', parent = null, disabled = false } = {}) {
  const node = {
    tag, attrs, textContent: text, parent, disabled,
    getAttribute: (k) => attrs[k] ?? null,
    matches(selector) {
      return selector.split(',').map((s) => s.trim()).some((s) => {
        const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s);
        if (attr) return attr[2] === undefined ? attr[1] in attrs : attrs[attr[1]] === attr[2];
        return s === tag;
      });
    },
    closest(selector) {
      for (let n = node; n; n = n.parent) if (n.matches(selector)) return n;
      return null;
    },
  };
  return node;
}

// Everything clickable can be selected (2026-10-24: "que el cursor seleccione todo lo que sea seleccionable"),
// except what is marked data-gesture="never": changing the agent's permissions, repairing, the servers
test('anything clickable can be selected: the innermost button, tab, menu item or row, with its label', () => {
  const dock = el({ attrs: { 'aria-label': 'Riesgos' } });
  const t = uiTarget(el({ tag: 'svg', parent: dock }), { keyOf: () => 'risks' });
  assert.deepEqual([t.key, t.selectable, t.label, t.element], ['ui:risks', true, 'Riesgos', dock]);
  for (const attrs of [{ role: 'tab' }, { role: 'menuitem' }, { role: 'treeitem' }, { role: 'radio' }, { 'data-path': 'src' }]) {
    assert.equal(uiTarget(el({ tag: 'div', attrs })).selectable, true, JSON.stringify(attrs));
  }
  const chip = el({ text: '¿Cómo vamos?' });
  assert.equal(uiTarget(chip).label, '¿Cómo vamos?');
  // a button inside a row is its own target, not the row
  const row = el({ tag: 'div', attrs: { role: 'treeitem' } });
  const copy = el({ tag: 'button', attrs: { 'aria-label': 'Copiar ruta' }, parent: row });
  assert.equal(uiTarget(el({ tag: 'span', parent: copy })).element, copy);
});

test('what is marked never — agent permissions, repairs, servers — and anything inside it is not selectable', () => {
  const permissions = el({ tag: 'div', attrs: { 'data-gesture': 'never', role: 'radiogroup' } });
  const bypass = el({ attrs: { role: 'radio', 'aria-label': 'Sin preguntar' }, parent: permissions });
  assert.equal(uiTarget(el({ tag: 'span', parent: bypass })).selectable, false);
  const repair = el({ attrs: { 'data-gesture': 'never', 'aria-label': 'Reparar' } });
  assert.equal(uiTarget(repair).selectable, false);
  const row = el({ tag: 'div', attrs: { role: 'treeitem' } });
  const inner = el({ attrs: { 'data-gesture': 'never' }, parent: row });
  assert.equal(uiTarget(inner).selectable, false, 'a never button inside a row');
  assert.equal(uiTarget(el({ tag: 'span', parent: row })).selectable, true, 'the row itself still is');
  assert.equal(uiTarget(el({ attrs: {}, disabled: true })).selectable, false, 'disabled');
});

test('plain text (nothing clickable) shows no ring', () => {
  assert.equal(uiTarget(el({ tag: 'p', text: 'Hola' })).selectable, false);
});

test('text fields never get the focus; with a confirmation open nothing is selectable (B21, B22)', () => {
  const input = el({ tag: 'textarea', parent: el({ attrs: { 'data-gesture': 'safe' } }) });
  assert.equal(uiTarget(input).selectable, false);
  const dock = el({ attrs: { 'data-gesture': 'safe' } });
  assert.equal(uiTarget(dock, { dialogOpen: true }).selectable, false);
  assert.equal(uiTarget(null), null);
});

test('3D picks become targets with a stable key and a short name (B15)', () => {
  assert.deepEqual(pickTarget({ type: 'folder', path: 'src/api' }), { key: 'pick:folder:src/api', kind: 'pick', pick: { type: 'folder', path: 'src/api' }, label: 'api', selectable: true });
  assert.equal(pickTarget({ type: 'table', name: 'users' }).label, 'users');
  assert.equal(pickTarget(null), null);
});

// Hands-free (spec/004-hands-free-control.md): the bar and the "Ajustes" panel live in their own layer and
// are selected directly (without the magnifier); what is blocked says so, so the pull never goes around it
test('the hands-free buttons are direct and say which they are; blocked targets say they are blocked', () => {
  const layer = el({ tag: 'div', attrs: { 'data-hands-free': 'layer' } });
  const pause = el({ attrs: { 'data-hands-free': 'pause', 'aria-label': 'Pausa' }, parent: layer });
  const t = uiTarget(pause);
  assert.equal(t.selectable, true);
  assert.equal(t.direct, true);
  assert.equal(t.handsFree, 'pause');
  const plain = uiTarget(el({ attrs: { 'aria-label': 'Riesgos' } }));
  assert.equal(plain.direct, false);
  assert.equal(plain.handsFree, null);
  assert.equal(uiTarget(el({ attrs: { 'data-gesture': 'never' } })).blocked, true);
  assert.equal(uiTarget(el(), { dialogOpen: true }).blocked, true);
  assert.equal(uiTarget(el({ tag: 'p' })).blocked, undefined, 'plain text is not blocked: the pull may look around it');
});
