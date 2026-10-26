// The lab catalog's words and small pictures, without DOM: names, chips, the checker's findings as plain
// text and one inline SVG per category. catalogView draws them; tests/renderer/catalogView.test.mjs checks them.
import { strings } from '../../i18n/es.js';
import { catalogSections } from '../../models/componentCatalog.js';

const L = strings.lab;

// dataTransfer type a catalog card carries while dragged (value = component id)
export const PART_MIME = 'application/x-qubbot-part';

const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// Static markup only (no project data), safe for innerHTML
export const CATEGORY_ICONS = {
  boards: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>'),
  sensors: svg('<circle cx="12" cy="15" r="2"/><path d="M8.5 11.5a5 5 0 0 1 7 0M5.6 8.6a9 9 0 0 1 12.8 0"/><path d="M12 17v4"/>'),
  actuators: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  displays: svg('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M7 8.5h6M7 12.5h10M9 20h6M12 16.5V20"/>'),
  inputs: svg('<circle cx="12" cy="13.5" r="6.5"/><path d="M12 13.5l3.2-3.2M12 2.5v2"/>'),
  power: svg('<rect x="2.5" y="7" width="16.5" height="10" rx="2"/><path d="M21.5 10.5v3M8 12h5M10.5 9.5v5"/>'),
};

export const colorHex = (n) => `#${(Number(n) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

export const partName = (type) => L.parts[type]?.name ?? type;
export const nameOf = (component) => partName(component.id);

// Short facts under a card: volts, mA drawn (parts only, when > 0) and how many pins
export function partChips(spec) {
  const chips = [];
  const volts = spec.kind === 'board' ? [spec.logic, spec.logic] : spec.volts ?? (spec.supplies ? [spec.supplies, spec.supplies] : null);
  if (volts) chips.push(L.catalog.volts(volts));
  if (spec.kind !== 'board' && spec.mA > 0) chips.push(L.catalog.mA(spec.mA));
  chips.push(L.catalog.pins(spec.pins.length));
  return chips;
}

// "LED 2" when there are several LEDs on the bench, "LED" when it is the only one
export function partLabel(design, partId) {
  const part = design?.parts?.find((p) => p.id === partId);
  if (!part) return partId ?? '';
  const name = partName(part.type);
  const same = design.parts.filter((p) => p.type === part.type);
  if (same.length < 2) return name;
  const n = Number(String(part.id).slice(part.type.length + 1));
  return L.panel.partLabel(name, Number.isInteger(n) && n > 0 ? n : same.indexOf(part) + 1);
}

// A checkDesign finding in plain words
export function issueText(issue, design) {
  const say = L.check.issues[issue.key];
  if (typeof say !== 'function') return issue.key;
  const part = issue.part ? partLabel(design, issue.part) : '';
  if (issue.key === 'budget') return say(part, issue.usedMa, issue.budgetMa);
  if (issue.key === 'pinShared') return say(part, issue.pin, issue.boardPin);
  return say(part, issue.pin);
}

const RANK = { red: 0, yellow: 1, green: 2 };

// The review list: [{ level, text, part|null }], red first (stable); part only when it is on the bench
export function issueRows(design, check) {
  const issues = check?.issues ?? [];
  const onBench = new Set((design?.parts ?? []).map((p) => p.id));
  return issues
    .map((issue, i) => ({ i, level: issue.level, text: issueText(issue, design), part: onBench.has(issue.part) ? issue.part : null }))
    .sort((a, b) => (RANK[a.level] ?? 3) - (RANK[b.level] ?? 3) || a.i - b.i)
    .map(({ level, text, part }) => ({ level, text, part }));
}

// The view model's sections, or the same thing built from its query
export const sectionsOf = (state) => state?.sections ?? catalogSections(state?.query ?? '', nameOf);

// "3 peligros · 1 por revisar" for the review header, from the rows issueRows built
export function reviewSummary(rows) {
  const red = rows.filter((r) => r.level === 'red').length;
  const yellow = rows.filter((r) => r.level === 'yellow').length;
  return { red, yellow, text: L.check.summary(red, yellow) };
}

// The enclosure's size and print estimate as two short lines; null while there is nothing to show
export function enclosureFacts(enclosure) {
  const data = enclosure?.data;
  if (!data?.ok || !data.size) return null;
  const { w, d, h } = data.size;
  const round = (n) => Math.round(Number(n) || 0);
  return {
    size: L.enclosure.size(round(w), round(d), round(h)),
    print: L.enclosure.print(Number(data.printMinutes) || 0, round(data.grams)),
  };
}
