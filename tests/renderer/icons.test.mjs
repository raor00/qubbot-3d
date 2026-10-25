import test from 'node:test';
import assert from 'node:assert/strict';
import { icon, iconOr } from '../../renderer/views/icons.js';

test('iconOr draws the named icon, and the fallback for a name without one (the Simulador has no logo)', () => {
  assert.equal(iconOr('claude', 'bot'), icon('claude'));
  assert.equal(iconOr('sim', 'bot'), icon('bot'));
  assert.throws(() => icon('sim'), /Unknown icon/);
});
