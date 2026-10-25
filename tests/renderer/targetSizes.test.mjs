// Small targets are hard for everyone who points with something other than a mouse: the head, the eyes,
// the system's head pointer or an eye tracker. These buttons get at least 24 × 24 px (WCAG 2.5.8;
// spec/004-hands-free-control.md, B35). Reads the CSS rule of each one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = (file) => fs.readFileSync(new URL(`../../renderer/styles/${file}`, import.meta.url), 'utf8');

// The declarations of the first rule whose selector list is exactly `selector`
function rule(file, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css(file).match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} in ${file}`);
  return match[1];
}
const px = (declarations, property) => {
  const m = declarations.match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`));
  return m ? Number(m[1]) : 0;
};
const atLeast24 = (file, selector, { width = true } = {}) => {
  const d = rule(file, selector);
  assert.ok(Math.max(px(d, 'min-height'), px(d, 'height')) >= 24, `${selector}: height`);
  if (width) assert.ok(Math.max(px(d, 'min-width'), px(d, 'width')) >= 24, `${selector}: width`);
};

test('breadcrumb buttons, Dev tree rows and actions, and the hand\'s "?" are at least 24 × 24 px (B35)', () => {
  atLeast24('main.css', '#breadcrumb .crumbs button');
  atLeast24('devtree.css', '.devtree-row', { width: false }); // rows take the whole width
  atLeast24('devtree.css', '.devtree-action-btn');
  atLeast24('controls.css', '#controls .hand-help-button');
});
