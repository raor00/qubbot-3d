// Icons (Hugeicons, see icons/iconNames.js; the agents' logos come from icons/brands.js). The color follows the text color and the stroke
// keeps Hugeicons' own width, so every icon looks the same wherever it is placed.
//   icon('folder')                  -> '<svg …>…</svg>' for templates
//   <i data-icon="folder"></i>      -> replaced by the svg in static HTML (applyIcons)
import { ICONS } from '../icons/hugeicons.js';
import { BRANDS } from '../icons/brands.js';

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export function icon(name) {
  if (BRANDS[name]) return BRANDS[name]; // an agent's own logo, in its colors
  const nodes = ICONS[name];
  if (!nodes) throw new Error(`Unknown icon: ${name}`);
  const inner = nodes.map(([tag, attrs]) => {
    // stroke="currentColor" is inherited from the svg instead, so CSS can recolor it (e.g. the active tab)
    const own = Object.entries(attrs).filter(([key, value]) => !(key === 'stroke' && value === 'currentColor'));
    return `<${tag} ${own.map(([key, value]) => `${kebab(key)}="${escapeAttr(value)}"`).join(' ')}/>`;
  }).join('');
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${inner}</svg>`;
}

// The icon for `name`, or `fallback` when there is none (an agent without a logo, like the Simulador)
export function iconOr(name, fallback) {
  return icon(BRANDS[name] || ICONS[name] ? name : fallback);
}

export function applyIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((placeholder) => {
    const template = document.createElement('template');
    template.innerHTML = icon(placeholder.dataset.icon);
    placeholder.replaceWith(template.content.firstChild);
  });
}
