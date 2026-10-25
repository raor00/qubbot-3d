// The hands-free control's screen (spec/004-hands-free-control.md), next to the hand:
//   · the eye button, in the same group as the hand's (both `never` for the gesture cursors: turning the camera
//     off by looking at it would leave the person without a way back)
//   · the hand's camera card, shared: while the hands-free control is on it shows its camera, its state and
//     what fits the moment (the choice of eyes or head, the position check, the calibration's counter, the
//     result, "Ajustes", or the buttons Pausa / Corregir / Recalibrar / Ajustes)
//   · nothing turns on by itself: the eye starts the camera and "Empezar" starts the calibration
//   · a layer outside <body> with the cursor, the magnifier's frame and, while calibrating, a veil with a hole
//     around the card (so only the points and the card are left) and the points themselves. It lives outside
//     <body> because the magnifier zooms <body> itself (a CSS scale around the gaze): the real elements grow,
//     so what is selected is the real element, with the same rules as a click.
// Only draws and forwards input to the view model.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { createHandCursorView } from './handCursorView.js';
import { syncPreview } from './handControlView.js';
import { SETTINGS_PAGES } from '../../viewmodels/handsFreeViewModel.js';

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const node = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};
// Only touches the DOM when something changed (the store changes ~30 times per second)
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const setHidden = (el, hidden) => { if (el.hidden !== hidden) el.hidden = hidden; };
// The card's buttons: at least the measured error of the gaze (B24), within reason
const BUTTON_MIN = 72;
const BUTTON_MAX = 140;
// The veil only while the points are on screen (the position check is in the card, with nothing dimmed)
const GUIDED = ['calibrating', 'result', 'centering'];

export function createHandsFreeView({ handsFreeViewModel: vm, settings, video, dev = false }) {
  const F = strings.handsFree;
  const P = F.settingsPanel;
  const button = document.getElementById('hands-free-control');
  const controls = document.getElementById('controls');
  const preview = document.getElementById('hand-preview');
  button.addEventListener('click', () => vm.toggle());

  // ---------- The card (inside the hand's camera card) ----------
  const card = node('div', 'hf-card');
  card.dataset.handsFree = 'card';
  const videoBox = node('div', 'hf-video');
  videoBox.append(video);
  const status = node('div', 'hf-status');
  const state = node('span', 'hf-state');
  const detail = node('span', 'hf-detail');
  const fps = node('span', 'hf-fps');
  status.append(state, detail, fps);
  const body = node('div', 'hf-body');
  card.append(videoBox, status, body);
  preview.append(card);

  // kind: the data-hands-free mark (which modal moment the button belongs to)
  const cardButton = (kind, iconName, label, run, cls = '') => {
    const b = node('button', `hf-btn ${cls}`.trim());
    b.type = 'button';
    b.dataset.handsFree = kind;
    const text = node('span', 'hf-btn-label', label);
    b.append(icon(iconName, { size: 24 }), text);
    b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
    b.label = text;
    return b;
  };
  const row = (...items) => { const r = node('div', 'hf-row'); r.append(...items); return r; };

  // ---------- The layer outside <body> ----------
  const layer = node('div');
  layer.id = 'hands-free-layer';
  layer.dataset.handsFree = 'layer';
  document.documentElement.appendChild(layer);
  const veil = node('div', 'hf-veil');
  veil.hidden = true;
  const marks = node('div', 'hf-marks');
  const dot = node('div', 'hf-dot');
  dot.hidden = true;
  dot.append(node('span', 'hf-dot-ring'));
  const lens = node('div', 'hf-lens');
  lens.hidden = true;
  lens.setAttribute('aria-hidden', 'true');
  layer.append(veil, marks, dot, lens);
  createHandCursorView({ handControlViewModel: vm, parent: layer, id: 'hands-free-cursor' });

  // ---------- What the card's body shows ----------
  let mode = null;
  let refs = {};

  function modeOf(st) {
    const on = st.status === 'on' || st.status === 'starting';
    if (st.choosing) return 'choosing';
    if (st.status === 'error') return 'error';
    if (!on) return 'off';
    if (st.settingsOpen) return 'settings';
    if (st.phase === 'result') return `result:${st.result?.rejected ?? ''}:${st.result?.hasBad}`;
    return st.phase; // ready, positioning, calibrating, centering, blinkSetup
  }

  function build(m, st) {
    refs = {};
    const cancel = () => cardButton('calibration', 'close', F.calibration.cancel, () => vm.cancelPhase(), 'small');
    if (m === 'choosing') {
      return [
        node('p', 'hf-title', F.choose),
        row(cardButton('choose', 'eye', F.withEyes, () => vm.optIn('eyes')), cardButton('choose', 'focus', F.withHead, () => vm.optIn('head'))),
      ];
    }
    if (m === 'positioning') {
      refs.issue = node('p', 'hf-big');
      refs.start = cardButton('calibration', 'play', F.positioning.start, () => vm.startCalibration(), 'primary');
      return [refs.issue, node('p', 'hf-hint', F.positioning.hint), row(refs.start, cancel())];
    }
    if (m === 'calibrating' || m === 'centering' || m === 'blinkSetup') {
      refs.text = node('p', 'hf-big');
      return [refs.text, row(cancel())];
    }
    if (m.startsWith('result:')) {
      const r = st.result;
      const parts = [node('p', 'hf-title', F.result.title), refs.quality = node('p', 'hf-big')];
      if (r.rejected) parts.push(node('p', 'hf-hint', r.rejected === 'inverted' ? F.result.inverted : F.result.failed));
      else parts.push(refs.error = node('p', 'hf-hint'));
      const buttons = [];
      if (!r.rejected) buttons.push(cardButton('calibration', 'ok', F.result.accept, () => vm.acceptCalibration(), 'primary'));
      if (!r.rejected && r.hasBad) buttons.push(cardButton('calibration', 'target', F.result.repeatBad, () => vm.repeatBadPoints()));
      buttons.push(cardButton('calibration', 'rotateLeft', F.result.repeat, () => vm.repeatCalibration()));
      parts.push(row(...buttons));
      return parts;
    }
    if (m === 'settings') {
      refs.page = node('span', 'hf-page');
      refs.label = node('p', 'hf-title');
      refs.value = node('output', 'hf-value');
      const head = node('div', 'hf-settings-head');
      head.append(node('strong', '', P.title), refs.page);
      return [
        head, refs.label,
        row(cardButton('settings', 'minus', P.less, () => vm.settingsStep(-1)), refs.value, cardButton('settings', 'plus', P.more, () => vm.settingsStep(1))),
        row(cardButton('settings', 'arrowLeft', P.previous, () => vm.settingsMove(-1)), cardButton('settings', 'close', P.close, () => vm.closeSettings()), cardButton('settings', 'arrowRight', P.next, () => vm.settingsMove(1))),
      ];
    }
    if (m === 'ready') {
      refs.pause = cardButton('pause', 'pause', F.bar.pause, () => vm.togglePause());
      refs.center = cardButton('bar', 'focus', F.bar.correct, () => vm.center());
      refs.recal = cardButton('bar', 'target', F.bar.recalibrate, () => vm.recalibrate());
      const grid = node('div', 'hf-grid');
      grid.append(refs.pause, refs.center, refs.recal, cardButton('bar', 'settings', F.bar.settings, () => vm.openSettings()));
      return [grid];
    }
    return [];
  }

  const valueText = (key, s) => {
    const eyes = s.pointer === 'eyes';
    switch (key) {
      case 'pointer': return P.pointers[s.pointer];
      case 'dwell': return P.seconds(eyes ? s.eyesDwellMs : s.headDwellMs);
      case 'tolerance': return `${Math.round((eyes ? s.eyesTolerance : s.headTolerance) * 100)} %`;
      case 'smoothing': return `${Math.round(s.smoothing * 100)} %`;
      case 'lensFactor': return P.times(s.lensFactor);
      case 'pace': return P.pace(s.pace);
      case 'headLens': case 'longBlink': return s[key] ? P.yes : P.no;
      default: return P.level(s[key]);
    }
  };

  const describe = (st, s) => {
    if (st.choosing) return '';
    if (st.status === 'starting') return F.starting;
    if (st.status === 'error') return F.errors[st.error] ?? F.errors.failed;
    if (st.phase === 'positioning') return F.positioning.title;
    if (st.phase === 'calibrating' || st.phase === 'centering' || st.phase === 'blinkSetup' || st.phase === 'result') return '';
    if (!st.face) return F.noFace;
    if (st.paused) return F.paused;
    if (st.lens) return F.lens;
    if (st.selected) return F.selected(st.selected);
    if (st.ring > 0) return F.holding;
    if (s.pointer === 'eyes' && !s.calibration) return F.needsCalibration;
    return s.pointer === 'eyes' ? F.looking : F.pointingHead;
  };

  // ---------- The magnifier: <body> zooms around the gaze ----------
  let lensOpen = false;
  let lastLens;
  function applyLens(l) {
    if (l === lastLens) return;
    lastLens = l;
    const b = document.body;
    b.style.transition = reducedMotion() ? 'none' : 'transform .16s ease-out'; // B32
    if (!l) {
      if (lensOpen) { b.style.transform = ''; b.style.transformOrigin = ''; }
      lensOpen = false;
      lens.hidden = true;
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    b.style.transformOrigin = `${l.origin.x * W}px ${l.origin.y * H}px`;
    b.style.transform = `scale(${l.factor})`;
    Object.assign(lens.style, { left: `${l.box.x * W}px`, top: `${l.box.y * H}px`, width: `${l.box.w * W}px`, height: `${l.box.h * H}px` });
    lens.hidden = false;
    lensOpen = true;
  }

  // ---------- The veil: everything dims except the card and the controls ----------
  function holeAroundCard() {
    const a = controls.getBoundingClientRect(), b = preview.getBoundingClientRect();
    const m = 8;
    const x = Math.min(a.left, b.left) - m, y = Math.min(a.top, b.top) - m;
    const w = Math.max(a.right, b.right) + m - x, h = Math.max(a.bottom, b.bottom) + m - y;
    const W = window.innerWidth, H = window.innerHeight;
    veil.style.clipPath = `path(evenodd, "M0 0H${W}V${H}H0Z M${x} ${y}h${w}v${h}h${-w}Z")`;
  }

  function drawResult(result) {
    const W = window.innerWidth, H = window.innerHeight;
    const items = (result?.report ?? []).flatMap((r) => {
      const target = node('span', `hf-mark${r.bad ? ' bad' : ''}`);
      target.style.transform = `translate(${r.target.x * W}px, ${r.target.y * H}px)`;
      const guess = node('span', 'hf-guess');
      guess.style.transform = `translate(${r.predicted.x * W}px, ${r.predicted.y * H}px)`;
      return [target, guess];
    });
    marks.replaceChildren(...items);
  }

  let paused = null, size = null, lastResult = null;
  function render() {
    const st = vm.store.state, s = settings.store.state;
    const on = st.status === 'on' || st.status === 'starting';
    if (button.getAttribute('aria-pressed') !== String(on)) button.setAttribute('aria-pressed', String(on));
    preview.dataset.handsFree = on || st.choosing || st.status === 'error' ? 'on' : 'off';
    syncPreview(preview);
    const px = `${Math.min(BUTTON_MAX, Math.max(BUTTON_MIN, st.errorPx ?? 0))}px`;
    if (px !== size) { size = px; preview.style.setProperty('--hf-size', px); }
    applyLens(on ? st.lens : null);

    // The body, rebuilt only when the moment changes
    const m = modeOf(st);
    if (m !== mode) {
      mode = m;
      paused = null;
      body.replaceChildren(...build(m, st));
      card.classList.toggle('positioning', m === 'positioning');
    }
    // The camera only while checking the position: after calibrating it is not needed (2026-10-25)
    setHidden(videoBox, !on || st.phase !== 'positioning');
    setText(state, describe(st, s));
    setText(detail, notice ?? (st.dark && on && st.phase !== 'positioning' ? F.dark
      : st.slow ? F.slow : on && s.pointer === 'eyes' && st.errorPx != null && st.phase === 'ready' ? F.error(st.errorPx) : ''));
    setHidden(fps, !dev || !on);
    if (dev) setText(fps, F.fps(st.fps, st.delegate, st.cameraSize));

    if (refs.issue) {
      const ok = Boolean(st.positioning?.ok);
      setText(refs.issue, ok ? F.positioning.ready : F.positioning.issues[st.positioning?.issue ?? 'noFace']);
      // Nothing starts by itself: "Empezar" when the position is right, "Empezar igual" otherwise
      setText(refs.start.label, ok ? F.positioning.start : F.positioning.anyway);
      refs.start.classList.toggle('primary', ok);
    }
    if (refs.text) {
      const c = st.calibration;
      setText(refs.text, st.phase === 'calibrating'
        ? (c?.stage === 'test' ? F.calibration.test(c.index + 1, c.total) : c?.stage === 'head' ? F.calibration.head : F.calibration.points((c?.index ?? 0) + 1, c?.total ?? 9))
        : st.phase === 'centering' ? (s.pointer === 'eyes' ? F.calibration.center : F.calibration.centerHead)
          : F.calibration.blink(st.blinkSetup?.count ?? 0, st.blinkSetup?.needed ?? 3));
    }
    if (refs.quality && st.result) {
      setText(refs.quality, F.result.quality[st.result.quality] ?? F.result.quality.bad);
      if (refs.error) setText(refs.error, F.result.error(st.result.errorPx));
    }
    if (refs.page) {
      const pages = SETTINGS_PAGES[s.pointer];
      setText(refs.page, P.page(st.settingsIndex + 1, pages.length));
      setText(refs.label, P.labels[st.settingsKey] ?? '');
      setText(refs.value, valueText(st.settingsKey, s));
    }
    if (refs.pause && st.paused !== paused) {
      paused = st.paused;
      refs.pause.label.textContent = paused ? F.bar.resume : F.bar.pause;
      refs.pause.replaceChild(icon(paused ? 'play' : 'pause', { size: 24 }), refs.pause.firstChild);
      refs.pause.setAttribute('aria-pressed', String(paused));
      card.classList.toggle('paused', paused);
    }
    if (refs.center) setText(refs.center.label, s.pointer === 'eyes' ? F.bar.correct : F.bar.recenter);
    if (refs.recal) setHidden(refs.recal, s.pointer !== 'eyes');

    // The veil and the points
    const guided = on && GUIDED.includes(st.phase);
    setHidden(veil, !guided);
    if (guided) holeAroundCard();
    const at = !on ? null : st.phase === 'calibrating' ? st.calibration?.point : st.phase === 'centering' ? { x: 0.5, y: 0.5 } : null;
    setHidden(dot, !at);
    if (at) {
      dot.style.transform = `translate(${at.x * window.innerWidth}px, ${at.y * window.innerHeight}px)`;
      const progress = st.phase === 'calibrating' ? st.calibration?.progress ?? 0 : st.centering?.progress ?? 0;
      dot.style.setProperty('--progress', String(reducedMotion() ? Math.floor(progress * 4) / 4 : progress));
      dot.classList.toggle('collecting', progress > 0);
    }
    const result = on && st.phase === 'result' ? st.result : null;
    if (result !== lastResult) { lastResult = result; drawResult(result); }
  }

  // ---------- The precision report (B38): only in npm run dev, ⌘⇧D (Ctrl+Shift+D) copies it ----------
  // Numbers only, to the clipboard and nowhere else (not the console, not the disk, not the network); the
  // card's detail line says for a moment whether it was copied
  let notice = null, noticeTimer = null;
  const tell = (text) => {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = null; render(); }, 3000);
    render();
  };
  if (dev) {
    window.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'd') return;
      e.preventDefault();
      const text = vm.report({ screen: { width: window.screen.width, height: window.screen.height } });
      if (!text) return tell(F.report.none);
      navigator.clipboard.writeText(text).then(() => tell(F.report.copied), () => tell(F.report.failed));
    });
  }

  vm.store.subscribe(render, { immediate: true });
  settings.store.subscribe(render);
  window.addEventListener('resize', render);
}
