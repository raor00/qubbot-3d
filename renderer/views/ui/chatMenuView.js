// The chat's options menu: from the "+" in the composer, and from the floating button that replaces the
// chat when it is minimized or closed. Built each time it opens from the app's state: who answers, how
// the project is, the worst risk and the pending repairs. Items only call app actions.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { thinkingOrb } from './thinkingOrb.js';

const M = strings.chat.menu;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// A button that opens a small menu above it. getItems() is called each time it opens.
export function attachMenu(button, menu, getItems) {
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  const close = () => { menu.hidden = true; button.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); };
  const entry = (item, className) => {
    const b = el('button', className);
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { item.run(button); close(); });
    return b;
  };
  const open = () => {
    const items = getItems();
    const parts = [];
    const head = items.find((x) => x.kind === 'header');
    if (head) {
      // who answers and how the project is; tapping it opens the chat
      const b = entry(head, 'chat-menu-head');
      const mark = el('span', 'chat-menu-mark');
      mark.appendChild(head.working ? thinkingOrb('working', { size: 20 }) : icon(head.agent, { size: 18, fallback: 'bot' }));
      mark.dataset.agent = head.agent;
      const text = el('span', 'chat-menu-text');
      text.append(el('strong', '', head.title), el('small', '', head.detail));
      b.append(mark, text, el('span', 'chat-menu-go', M.openShort));
      b.setAttribute('aria-label', M.open);
      parts.push(b);
    }
    const tiles = el('div', 'chat-menu-tiles');
    for (const item of items.filter((x) => x.kind === 'tile')) {
      const b = entry(item, `chat-menu-tile ${item.id}${item.accent ? ` accent-${item.accent}` : ''}`);
      if (item.id === 'repair') b.dataset.gesture = 'never'; // the hand cursor never selects it (spec/003-hand-gestures.md, B20)
      b.append(icon(item.icon, { size: 16 }), el('span', '', item.label));
      if (item.badge) b.appendChild(el('b', 'chat-menu-badge', String(item.badge)));
      tiles.appendChild(b);
    }
    parts.push(tiles);
    const foot = el('div', 'chat-menu-foot');
    for (const item of items.filter((x) => x.kind === 'foot')) {
      const b = entry(item, `chat-menu-link ${item.id}`);
      b.append(icon(item.icon, { size: 14 }), el('span', '', item.label));
      foot.appendChild(b);
    }
    parts.push(foot);
    menu.replaceChildren(...parts);
    menu.hidden = false;
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
  };
  button.setAttribute('aria-haspopup', 'menu');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(); else close();
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  return { close };
}
