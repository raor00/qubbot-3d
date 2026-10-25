// Icons for the chat views as DOM elements, on top of the app's Hugeicons (views/icons.js; names in
// icons/iconNames.js). Markdown callouts carry <i data-icon> slots that views/icons.js applyIcons() fills.
import { icon as iconSvg, iconOr } from '../icons.js';

export function icon(name, { size = 18, fallback } = {}) {
  const template = document.createElement('template');
  template.innerHTML = fallback ? iconOr(name, fallback) : iconSvg(name);
  const svg = template.content.firstChild;
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  return svg;
}

// The agent's tools, each with its icon (run card steps)
export const TOOL_ICONS = {
  get_project: 'layers',
  list_risks: 'shieldWarn',
  read_file: 'audit',
  write_file: 'wrench',
  set_file_score: 'shieldOk',
  show_folder: 'locate',
};
