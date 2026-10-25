// What the hand cursor is over, and whether holding still may select it (spec/003-hand-gestures.md,
// B15-B22). Everything clickable can be selected, like with the mouse: buttons, tabs, menu items, rows,
// chips, links. The exception is what is marked data-gesture="never" (and anything inside it): changing
// the agent's permissions, repairing (it lets the agent write) and the servers (pausing one asks nothing),
// because a hand resting on the screen must not trigger them. Text fields never get the focus, and while a
// confirmation dialog is open nothing is selectable (the dialog itself is out of the cursor's reach).
// Works on anything with `closest()` (tests use small fakes), so the rules are testable without a DOM.
export const GESTURE_ATTRIBUTE = 'data-gesture';
const NEVER = `[${GESTURE_ATTRIBUTE}="never"], #server-menu`;
const TEXT = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
export const HANDS_FREE_ATTRIBUTE = 'data-hands-free';
const HANDS_FREE = `[${HANDS_FREE_ATTRIBUTE}]`;
export const CLICKABLE = [
  'button', 'a[href]', 'summary', 'label',
  '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="menuitemradio"]', '[role="radio"]',
  '[role="checkbox"]', '[role="switch"]', '[role="option"]', '[role="treeitem"]', '[role="link"]',
  `[${GESTURE_ATTRIBUTE}="safe"]`, '[data-path]',
].join(', ');

// A short name for "Seleccionado: …": its label, title or text
export function labelOf(element) {
  const text = element.getAttribute?.('aria-label') || element.getAttribute?.('title') || element.textContent || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 40);
}

// element: what is under the cursor (document.elementFromPoint); keyOf(element) -> a stable id
export function uiTarget(element, { dialogOpen = false, keyOf = () => 'el' } = {}) {
  if (!element) return null;
  // blocked: something that must not be selected is right here, so the hands-free pull does not look around it
  const no = (why, blocked) => ({ key: `ui:${why}:${keyOf(element)}`, kind: 'ui', selectable: false, ...(blocked && { blocked: true }) });
  if (dialogOpen) return no('dialog', true);
  if (element.closest(TEXT)) return no('text', true);
  if (element.closest(NEVER)) return no('never', true);
  const target = element.closest(CLICKABLE); // the innermost clickable thing (a button inside a row is the button)
  if (!target) return no('other');
  if (target.disabled || target.getAttribute?.('aria-disabled') === 'true') return no('disabled', true);
  // The hands-free layer (its bar, "Ajustes"): selected directly, never magnified (spec/004-hands-free-control.md)
  const own = target.closest(HANDS_FREE);
  const handsFree = own ? own.getAttribute(HANDS_FREE_ATTRIBUTE) : null;
  return { key: `ui:${keyOf(target)}`, kind: 'ui', element: target, label: labelOf(target), selectable: true, direct: Boolean(own), handsFree };
}

// A clickable 3D object (MapViewModel.handlePick / GitViewModel.handlePick routes it)
export function pickTarget(pick) {
  if (!pick) return null;
  const id = pick.path ?? pick.name ?? pick.sha ?? pick.id ?? '';
  const label = String(pick.path ?? pick.name ?? pick.short ?? pick.sha ?? pick.type).split('/').filter(Boolean).at(-1) ?? '';
  return { key: `pick:${pick.type}:${id}`, kind: 'pick', pick, label: label.slice(0, 40), selectable: true };
}
