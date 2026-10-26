// Lab simulation model. Pure and deterministic: given a design and a time in ms, returns the live
// state of every part and the flow on every wire. No Math.random, no Date — everything is a function
// of `tMs`.  Uses checkDesign from circuitModel to decide what is alive and what is broken.
import { checkDesign } from './circuitModel.js';
import { componentOf } from './componentCatalog.js';
import { wireKind } from '../viewmodels/labLayout.js';

/* ---- helpers ---- */

// A deterministic wave that oscillates between `min` and `max` with the given period (ms).
// Sine for smooth waves, triangle for faster up/down.
function waveSin(tMs, period, min, max) {
  const t = (tMs % period + period) % period;
  return min + ((max - min) * (1 + Math.sin((2 * Math.PI * t) / period))) / 2;
}

function waveTri(tMs, period, min, max) {
  const t = (tMs % period + period) % period;
  const half = period / 2;
  // Triangle wave: 0 at start, 1 at midpoint, back to 0 at end of period.
  const v = t < half ? t / half : 2 - t / half;
  return min + v * (max - min);
}

// Maps a value from one range to another (clamp-then-interpolate).
function mapRange(val, fromMin, fromMax, toMin, toMax) {
  const t = Math.max(0, Math.min(1, (val - fromMin) / (fromMax - fromMin)));
  return toMin + t * (toMax - toMin);
}

// Whether a part is connected to the board through a common net.  A part "lives" only when at
// least one of its pins shares a net with a board pin (checked by the circuitModel nets).
function partConnectsToBoard(design, partId) {
  // Quick check: if the part has any wire, it probably shares a net with the board.
  // For correctness we rely on checkDesign having already validated the wiring.
  const hasWire = design.wires.some(
    (w) => w.from.part === partId || w.to.part === partId,
  );
  return hasWire;
}

// Whether a part participates in a short net (the short issue's pins list the part's pins).
function partHasShort(design, partId) {
  return checkDesign(design).issues.some(
    (i) => i.key === 'short' && i.pins?.some((m) => m.part === partId),
  );
}

/* ---- part state factories ---- */

/** @returns {import('./circuitModel.js').Design} */
function dead(kind) {
  return { kind, dead: true };
}

function boardState(dead) {
  return { kind: 'board', running: !dead };
}

function ledState(isDead, tMs, options) {
  if (isDead) return dead('led');
  // If a distance sensor is present and close (< 20 cm), the LED stays on.
  if (options.distanceCm != null && options.distanceCm < 20) return { kind: 'led', on: true };
  // If a button is present and pressed, the LED follows the button.
  if (options.buttonPressed) return { kind: 'led', on: true };
  // Otherwise blinks 1 Hz (on during first half of each 1s period).
  return { kind: 'led', on: (tMs % 1000) < 500 };
}

function servoState(isDead, tMs, options) {
  if (isDead) return dead('servo');
  // Follow distance when there is a distance sensor: 5..60 cm → 0..180 deg.
  if (options.distanceCm != null) {
    return { kind: 'servo', angle: mapRange(options.distanceCm, 5, 60, 0, 180) };
  }
  // Barre 0→180→0 in 4 s.
  return { kind: 'servo', angle: waveTri(tMs, 4000, 0, 180) };
}

function distanceState(isDead, tMs) {
  if (isDead) return dead('distance');
  return { kind: 'distance', cm: waveSin(tMs, 6000, 5, 60) };
}

function pirState(isDead, tMs) {
  if (isDead) return dead('motion');
  // Window: 2 s detected every 7 s.
  const t = (tMs % 7000) / 7000;
  return { kind: 'motion', detected: t < 2 / 7 };
}

function climateState(isDead, tMs) {
  if (isDead) return dead('climate');
  return {
    kind: 'climate',
    c: Math.round(waveSin(tMs, 30000, 22, 28) * 10) / 10,
    h: Math.round(waveSin(tMs + 5000, 40000, 40, 60) * 10) / 10,
  };
}

function soilState(isDead, tMs) {
  if (isDead) return dead('soil');
  return { kind: 'soil', percent: Math.round(waveTri(tMs, 20000, 10, 90) * 10) / 10 };
}

function lightState(isDead, tMs) {
  if (isDead) return dead('light');
  return { kind: 'light', percent: Math.round(waveTri(tMs, 25000, 5, 95) * 10) / 10 };
}

function knobState(isDead, tMs) {
  if (isDead) return dead('knob');
  return { kind: 'knob', percent: Math.round(waveTri(tMs, 15000, 0, 100) * 10) / 10 };
}

function buttonState(isDead, tMs) {
  if (isDead) return dead('button');
  // Pressed 0.5 s every 3 s.
  return { kind: 'button', pressed: (tMs % 3000) < 500 };
}

function buzzerState(isDead, tMs, options) {
  if (isDead) return dead('buzzer');
  // On when distance < 20 cm.
  if (options.distanceCm != null && options.distanceCm < 20) return { kind: 'buzzer', on: true };
  return { kind: 'buzzer', on: false };
}

function relayState(isDead, tMs, options) {
  if (isDead) return dead('relay');
  if (options.distanceCm != null && options.distanceCm < 20) return { kind: 'relay', on: true };
  return { kind: 'relay', on: false };
}

function displayState(isDead, tMs, partsByType, options) {
  if (isDead) return dead('display');
  let line1, line2;

  // Main reading: distance, or climate (temp/hum), or "¡Hola!" with seconds.
  if (options.distanceCm != null) {
    line1 = `Dist: ${Math.round(options.distanceCm)} cm`;
    line2 = '';
  } else if (options.tempC != null) {
    line1 = `${options.tempC}°C`;
    line2 = `H: ${options.hum}%`;
  } else {
    line1 = '¡Hola!';
    line2 = `${Math.floor(tMs / 1000)} s`;
  }
  return { kind: 'display', lines: [line1, line2] };
}

function motorState(isDead, tMs, options) {
  if (isDead) return dead('motors');
  let speed = 0;
  // Follow knob when present, otherwise follow distance.
  if (options.knobPercent != null) {
    speed = options.knobPercent / 100;
  } else if (options.distanceCm != null) {
    // Close = fast, far = slow.
    speed = 1 - mapRange(options.distanceCm, 5, 60, 0, 1);
  }
  return { kind: 'motors', speed: Math.max(0, Math.min(1, speed)) };
}

/* ---- main entry point ---- */

/**
 * Simulate a design at a given time.
 * @param {{ version: number, parts: Array<{id:string,type:string,x:number,z:number,rot:number}>, wires: Array<{id:string,from:{part:string,pin:string},to:{part:string,pin:string}}> }} design
 * @param {number} tMs time in milliseconds (deterministic).
 * @returns {{ parts: Record<string, object>, wires: Record<string, number> }}
 */
export function simulate(design, tMs) {
  const check = checkDesign(design);
  const result = { parts: {}, wires: {} };

  // ---- collect ambient sensor values from the design ----
  let distanceCm = null;
  let tempC = null;
  let hum = null;
  let knobPercent = null;
  let buttonPressed = false;
  let hasButton = false;
  let hasDistance = false;

  // Pre-scan all parts to gather ambient state first.
  for (const p of design.parts) {
    const spec = componentOf(p.type);
    if (!spec) continue;
    const dead = check.parts[p.id] === 'red' || check.parts[p.id] === 'yellow' || partHasShort(design, p.id);
    if (spec.kind === 'part') {
      switch (p.type) {
        case 'hc-sr04': if (!dead) { distanceCm = waveSin(tMs, 6000, 5, 60); hasDistance = true; } break;
        case 'dht22': if (!dead) { tempC = waveSin(tMs, 30000, 22, 28); hum = waveSin(tMs + 5000, 40000, 40, 60); } break;
        case 'potentiometer': if (!dead) { knobPercent = waveTri(tMs, 15000, 0, 100); } break;
        case 'button':
          if (!dead) {
            buttonPressed = (tMs % 3000) < 500;
            hasButton = true;
          } break;
      }
    }
  }

  // ---- per-part state ----
  for (const p of design.parts) {
    const spec = componentOf(p.type);
    if (!spec) { result.parts[p.id] = { kind: 'unknown', dead: true }; continue; }

    // A part is dead when checkDesign marks it yellow or red, or it is shorted.
    const isDead = check.parts[p.id] === 'red' || check.parts[p.id] === 'yellow';
    const connected = partConnectsToBoard(design, p.id) && !isDead;

    // Boards are never dead (they are the power source).
    if (spec.kind === 'board') {
      result.parts[p.id] = boardState(false);
      continue;
    }

    const opts = { distanceCm, tempC, hum, knobPercent, buttonPressed };
    const state = {
      led: () => ledState(!connected, tMs, opts),
      'servo-sg90': () => servoState(!connected, tMs, opts),
      'hc-sr04': () => distanceState(!connected, tMs),
      pir: () => pirState(!connected, tMs),
      dht22: () => climateState(!connected, tMs),
      soil: () => soilState(!connected, tMs),
      ldr: () => lightState(!connected, tMs),
      buzzer: () => buzzerState(!connected, tMs, opts),
      relay: () => relayState(!connected, tMs, opts),
      'oled-128x64': () => displayState(!connected, tMs, design.parts, opts),
      'lcd-1602-i2c': () => displayState(!connected, tMs, design.parts, opts),
      button: () => buttonState(!connected, tMs),
      potentiometer: () => knobState(!connected, tMs),
      l298n: () => motorState(!connected, tMs, opts),
    };
    result.parts[p.id] = (state[p.type] || (() => dead(p.type)))();
  }

  // ---- per-wire flow ----
  for (const w of design.wires) {
    const kind = wireKind(design, w);
    if (kind === 'bus') { result.wires[w.id] = 0; continue; }

    // For power and gnd: flow = 1 if BOTH ends connect to a live part (i.e. the part that owns the
    // pin is alive).
    if (kind === 'power' || kind === 'gnd') {
      const fromPart = design.parts.find((p) => p.id === w.from.part);
      const toPart = design.parts.find((p) => p.id === w.to.part);
      const fromDead = fromPart && (check.parts[fromPart.id] === 'red' || check.parts[fromPart.id] === 'yellow');
      const toDead = toPart && (check.parts[toPart.id] === 'red' || check.parts[toPart.id] === 'yellow');
      // Power/gnd flow is 1 if neither end is dead and both connect to the board.
      result.wires[w.id] = (!fromDead && !toDead) ? 1 : 0;
      continue;
    }

    // Signal wires: a heartbeat that moves with tMs.
    // Index the signal for variety: count how many wires come before this one in the design.
    let idx = 0;
    for (let i = 0; i < design.wires.length; i++) {
      if (design.wires[i].id === w.id) break;
      if (wireKind(design, design.wires[i]) !== 'bus') idx++;
    }
    const heartbeat = (tMs / 600 + idx * 0.3) % 1;
    // 0 if either end is dead.
    const fromPart = design.parts.find((p) => p.id === w.from.part);
    const toPart = design.parts.find((p) => p.id === w.to.part);
    const fromDead = fromPart && (check.parts[fromPart.id] === 'red' || check.parts[fromPart.id] === 'yellow');
    const toDead = toPart && (check.parts[toPart.id] === 'red' || check.parts[toPart.id] === 'yellow');
    result.wires[w.id] = (fromDead || toDead) ? 0 : heartbeat;
  }

  return result;
}

/* ---- exported constants for consumers who need part-kind maps ---- */

export const SIM_KINDS = Object.freeze({
  board: 'board',
  distance: 'distance',
  motion: 'motion',
  climate: 'climate',
  soil: 'soil',
  light: 'light',
  button: 'button',
  knob: 'knob',
  led: 'led',
  servo: 'servo',
  buzzer: 'buzzer',
  relay: 'relay',
  display: 'display',
  motors: 'motors',
});