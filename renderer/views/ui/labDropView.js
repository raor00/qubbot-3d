// Dropping catalog parts on the lab bench: while a card is dragged over the stage, a dashed ghost of the
// part's footprint follows the cursor on the ground; on drop the part is added there (labViewModel.add).
// Only draws: where the part ends up is the view model's call (it may nudge it to a free spot).
import { strings } from '../../i18n/es.js';
import { componentOf } from '../../models/componentCatalog.js';
import { partBox } from '../../viewmodels/labLayout.js';
import { PART_MIME, partName } from './catalogItems.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// The type being dragged: dataTransfer data cannot be read during dragover, so the catalog notes it here
let dragged = null;
export const noteDragStart = (type) => { dragged = type; };
export const noteDragEnd = () => { dragged = null; };

// Four ground corners [{ x, y: 0, z }] (world units) of a part of `type` centered at `at`, turned rot quarters
export function footprintCorners(type, at, rot = 0) {
  if (!componentOf(type)) return [];
  const { w, d } = partBox({ type, x: at.x, z: at.z, rot });
  const hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([dx, dz]) => ({ x: at.x + dx, y: 0, z: at.z + dz }));
}

const hasPart = (e) => Array.from(e.dataTransfer?.types ?? []).includes(PART_MIME);

// stage: the map's container; sceneView: groundPointAt / toScreen; isActive(): the lab view is on screen
export function attachLabDrop({ stage, sceneView, labViewModel, isActive }) {
  // Ghost: a full-window SVG layer (never takes the pointer) with the footprint and a small label
  const layer = document.createElementNS(SVG_NS, 'svg');
  layer.setAttribute('class', 'lab-drop-ghost');
  layer.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(SVG_NS, 'polygon');
  shape.setAttribute('class', 'lab-drop-shape');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'lab-drop-dot');
  dot.setAttribute('r', '3');
  layer.append(shape, dot);
  const tag = document.createElement('div');
  tag.className = 'lab-drop-tag';
  tag.setAttribute('role', 'status');
  document.body.append(layer, tag);
  let shown = false;

  const canvasRect = () => (stage.querySelector('canvas') ?? stage).getBoundingClientRect();

  function hide() {
    if (!shown) return;
    shown = false;
    layer.classList.remove('on');
    tag.classList.remove('on');
  }

  function show(e) {
    const point = sceneView.groundPointAt(e.clientX, e.clientY);
    if (!point) return hide();
    const type = dragged;
    const r = canvasRect();
    const corners = type ? footprintCorners(type, point) : [];
    const screen = corners.map((c) => sceneView.toScreen(c)).map((p) => `${(p.x + r.left).toFixed(1)},${(p.y + r.top).toFixed(1)}`);
    shape.setAttribute('points', screen.join(' '));
    const center = sceneView.toScreen({ x: point.x, y: 0, z: point.z });
    dot.setAttribute('cx', (center.x + r.left).toFixed(1));
    dot.setAttribute('cy', (center.y + r.top).toFixed(1));
    tag.textContent = type ? strings.lab.panel.dropPart(partName(type)) : strings.lab.bench.dropHere;
    tag.style.transform = `translate(${Math.round(e.clientX + 14)}px, ${Math.round(e.clientY + 16)}px)`;
    if (!shown) {
      shown = true;
      layer.classList.add('on');
      tag.classList.add('on');
    }
  }

  const onOver = (e) => {
    if (!hasPart(e) || !isActive()) return;
    e.preventDefault(); // allows the drop
    e.dataTransfer.dropEffect = 'copy';
    show(e);
  };
  const onLeave = (e) => {
    if (e.relatedTarget && stage.contains(e.relatedTarget)) return;
    hide();
  };
  const onDrop = (e) => {
    if (!hasPart(e) || !isActive()) return;
    e.preventDefault();
    hide();
    const type = e.dataTransfer.getData(PART_MIME) || dragged;
    noteDragEnd();
    if (!componentOf(type)) return;
    const point = sceneView.groundPointAt(e.clientX, e.clientY);
    if (point) labViewModel.add(type, { x: point.x, z: point.z });
    else labViewModel.add(type);
  };
  const onEnd = () => { noteDragEnd(); hide(); };

  stage.addEventListener('dragenter', onOver);
  stage.addEventListener('dragover', onOver);
  stage.addEventListener('dragleave', onLeave);
  stage.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onEnd);
  document.addEventListener('drop', hide, true);

  return {
    destroy() {
      stage.removeEventListener('dragenter', onOver);
      stage.removeEventListener('dragover', onOver);
      stage.removeEventListener('dragleave', onLeave);
      stage.removeEventListener('drop', onDrop);
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('drop', hide, true);
      layer.remove();
      tag.remove();
    },
  };
}
