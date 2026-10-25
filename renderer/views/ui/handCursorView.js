// The gesture cursor (spec/003-hand-gestures.md, spec/004-hands-free-control.md): a purple dot that follows
// the hand, the head or the gaze over the whole window, with a ring that fills while it holds still on
// something selectable (on the target itself when the pull found one). It never takes the mouse's place:
// the layer lets every click through (pointer-events: none).
// createHandTargets is the screen side the view models ask for (as `actions`): what is under or near a
// point, whether a part of the window has something to select, selecting like a click, hovering, and
// zooming around a point. The 3D side reuses the mouse code (inputController's pickAtScreen and zoomAt).
import { uiTarget, pickTarget, CLICKABLE } from './handTargets.js';
import { nearestTarget } from '../../models/faceGesture.js';

const px = (n, size) => Math.round(n * size);
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const overlaps = (r, b) => r.left < b.x + b.w && r.right > b.x && r.top < b.y + b.h && r.bottom > b.y;
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

// canvas: the 3D scene's canvas · pickAtScreen(x, y) / zoomAt(factor, x, y): inputController ·
// handlePick(pick): the active view's click · hover(pick | null, x, y): the hover card ·
// dialogOpen(): a confirmation dialog is open (nothing is selectable meanwhile)
export function createHandTargets({ canvas, pickAtScreen, zoomAt, handlePick, hover, dialogOpen = () => false }) {
  const ids = new WeakMap();
  let next = 1;
  const keyOf = (element) => {
    if (!ids.has(element)) ids.set(element, element.id || `${element.dataset?.side ?? element.dataset?.stage ?? element.dataset?.path ?? 'el'}#${next++}`);
    return ids.get(element);
  };
  const W = () => window.innerWidth, H = () => window.innerHeight;

  const targetAtPx = (x, y) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return null;
    if (element === canvas) return dialogOpen() ? null : pickTarget(pickAtScreen(x, y));
    return uiTarget(element, { dialogOpen: dialogOpen(), keyOf });
  };

  // Clickable elements that are really on top (not covered) and overlap `box` (px), as candidates
  function clickablesIn(box, { skipHandsFree = false } = {}) {
    const out = [];
    for (const el of document.querySelectorAll(CLICKABLE)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !overlaps(r, box)) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || (top !== el && !el.contains(top))) continue;
      const t = uiTarget(top, { dialogOpen: false, keyOf });
      if (!t?.selectable || t.element !== el || (skipHandsFree && t.direct)) continue;
      out.push({ target: t, rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
    }
    return out;
  }

  const centerOf = (rect) => ({ x: (rect.x + rect.w / 2) / W(), y: (rect.y + rect.h / 2) / H() });

  return {
    targetAt(nx, ny) {
      return targetAtPx(px(nx, W()), px(ny, H()));
    },

    // What is right under the point or, when that is nothing clickable, the nearest selectable thing within
    // radius px (the pull). Something blocked right here (never, a dialog) is returned as is: no pull around it.
    targetNear(nx, ny, radius) {
      if (dialogOpen()) return null;
      const x = px(nx, W()), y = px(ny, H());
      const direct = targetAtPx(x, y);
      if (direct?.blocked) return { target: direct, at: null };
      if (direct?.selectable) {
        const r = direct.element?.getBoundingClientRect();
        return { target: direct, at: r ? centerOf({ x: r.left, y: r.top, w: r.width, h: r.height }) : { x: nx, y: ny } };
      }
      const candidates = clickablesIn({ x: x - radius, y: y - radius, w: 2 * radius, h: 2 * radius });
      if (document.elementFromPoint(x, y) === canvas) {
        for (const f of [0.5, 1]) {
          for (const [dx, dy] of AROUND) {
            const point = { x: x + dx * radius * f, y: y + dy * radius * f };
            if (document.elementFromPoint(point.x, point.y) !== canvas) continue;
            const pick = pickAtScreen(point.x, point.y);
            if (pick) candidates.push({ target: pickTarget(pick), point });
          }
        }
      }
      const best = nearestTarget({ x, y }, candidates, radius);
      if (!best) return direct ? { target: direct, at: null } : null;
      return { target: best.target, at: best.rect ? centerOf(best.rect) : { x: best.point.x / W(), y: best.point.y / H() } };
    },

    // Is there anything to select in this part of the window (0..1)? Opens the hands-free magnifier
    anyTargetIn(rect) {
      if (dialogOpen()) return false;
      const box = { x: rect.x * W(), y: rect.y * H(), w: rect.w * W(), h: rect.h * H() };
      if (clickablesIn(box, { skipHandsFree: true }).length) return true;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const x = box.x + (box.w * (i + 0.5)) / 3, y = box.y + (box.h * (j + 0.5)) / 3;
          if (document.elementFromPoint(x, y) === canvas && pickAtScreen(x, y)) return true;
        }
      }
      return false;
    },

    select(target) {
      if (dialogOpen()) return;
      if (target.kind === 'pick') handlePick(target.pick);
      else if (target.kind === 'ui' && target.selectable && target.element?.isConnected) target.element.click();
    },
    hover(target, nx, ny) {
      hover(target?.kind === 'pick' ? target.pick : null, px(nx ?? 0, W()), px(ny ?? 0, H()));
    },
    zoomAt(factor, nx, ny) {
      zoomAt(factor, px(nx, W()), px(ny, H()));
    },
    viewport: () => ({ width: W(), height: H() }),
  };
}

// vm: a view model whose store has { status, cursor, ring, ringAt? } · parent: where the cursor lives (the
// hands-free one lives outside <body>, so the magnifier's zoom does not move it)
export function createHandCursorView({ handControlViewModel: vm, parent = document.body, id = 'hand-cursor' }) {
  const cursor = document.createElement('div');
  cursor.id = id;
  cursor.className = 'gesture-cursor';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('span');
  ring.className = 'hand-ring';
  const dot = document.createElement('span');
  dot.className = 'hand-dot';
  cursor.append(ring, dot);
  parent.appendChild(cursor);

  vm.store.subscribe(({ cursor: at, ring: progress, ringAt, status }) => {
    const visible = Boolean(at) && status === 'on';
    cursor.hidden = !visible;
    if (!visible) return;
    const x = px(at.x, window.innerWidth), y = px(at.y, window.innerHeight);
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    // The ring sits on the target the pull found, not on the point (spec/004, B18)
    const rx = ringAt ? px(ringAt.x, window.innerWidth) - x : 0, ry = ringAt ? px(ringAt.y, window.innerHeight) - y : 0;
    ring.style.transform = rx || ry ? `translate(${rx}px, ${ry}px)` : '';
    // "Reducir movimiento": the ring fills in quarters, without a continuous sweep (B25)
    cursor.style.setProperty('--progress', String(reducedMotion() ? Math.floor(progress * 4) / 4 : progress));
    cursor.classList.toggle('holding', progress > 0);
  });
}
