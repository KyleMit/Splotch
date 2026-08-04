import {
  STORAGE_KEYS,
  readBool,
  readString,
  writeBool,
  writeString,
  onDurableRestore,
} from '../storage';
import type { Origin } from './modal.svelte';

// The Grown-Ups Only gate (App Store Guideline 5.1.4): before a grown-ups area
// opens (Settings, the AI art flow), an adult solves a multiplication problem
// on a keypad. A remember preference can relax re-prompting, but only takes
// effect after a successful solve — selecting it never unlocks anything by
// itself, which is what keeps the gate compliant. Purchases or external links
// on a kid-reachable surface would need to bypass the remember preference and
// gate every time; today none exist outside the gated areas, so no bypass
// switch is shipped.

export const GATE_REMEMBER_MODES = ['always', 'session', 'forever'] as const;
export type GateRememberMode = (typeof GATE_REMEMBER_MODES)[number];

// Operands are single digits but skip 0–2: those make products a young child
// could guess or count to, and the challenge must stay adult-difficulty.
export const GATE_OPERAND_MIN = 3;
export const GATE_OPERAND_MAX = 9;

// How long the wrong-answer message stays readable under the equation.
export const GATE_ERROR_VISIBLE_MS = 2200;
// Matches the gateShakeSoft CSS animation in ParentalGate.svelte.
export const GATE_SHAKE_MS = 400;
// How long the "Unlocked!" card shows before the gated destination opens.
export const GATE_SUCCESS_HOLD_MS = 1200;

export const GATE_ERROR_MESSAGE = 'Not quite — try this one';

function isRememberMode(value: string | null): value is GateRememberMode {
  return (GATE_REMEMBER_MODES as readonly (string | null)[]).includes(value);
}

function readRememberMode(fallback: GateRememberMode): GateRememberMode {
  const raw = readString(STORAGE_KEYS.gateRememberMode, fallback);
  return isRememberMode(raw) ? raw : fallback;
}

export interface ParentalGateState {
  open: boolean;
  origin: Origin | null;
  /** Current operands; regenerated on every open and every wrong answer. */
  x: number;
  y: number;
  input: string;
  error: string | null;
  /** Drives the wrong-answer shake; cleared when the animation ends. */
  shaking: boolean;
  /** True from a correct answer until the success card hands off. */
  unlocked: boolean;
  rememberMode: GateRememberMode;
  /** In-memory only, so an app relaunch always re-asks. */
  sessionUnlocked: boolean;
  foreverUnlocked: boolean;
}

export const gate: ParentalGateState = $state({
  open: false,
  origin: null,
  x: GATE_OPERAND_MIN,
  y: GATE_OPERAND_MIN,
  input: '',
  error: null,
  shaking: false,
  unlocked: false,
  rememberMode: readRememberMode('always'),
  sessionUnlocked: false,
  foreverUnlocked: readBool(STORAGE_KEYS.gateUnlockedForever, false),
});

// Per-attempt continuation and timer handles — deliberately untracked: nothing
// renders them, and dismissGate() (reachable from every path) resets them.
let pendingDestination: (() => void) | null = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;
let shakeTimer: ReturnType<typeof setTimeout> | undefined;
let successTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimers() {
  clearTimeout(errorTimer);
  clearTimeout(shakeTimer);
  clearTimeout(successTimer);
}

function randomOperand() {
  return GATE_OPERAND_MIN + Math.floor(Math.random() * (GATE_OPERAND_MAX - GATE_OPERAND_MIN + 1));
}

// A fresh problem on every attempt keeps a child from brute-forcing one answer.
function newChallenge() {
  gate.x = randomOperand();
  gate.y = randomOperand();
  gate.input = '';
}

export function hasActiveGateUnlock(): boolean {
  return gate.sessionUnlocked || gate.foreverUnlocked;
}

/**
 * Run `destination` behind the gate: immediately when a session/forever unlock
 * is active, otherwise after the challenge is solved. `origin` is the tapped
 * button's center, for the modal fly-in.
 */
export function requireParentalGate(destination: () => void, origin: Origin | null = null) {
  if (hasActiveGateUnlock()) {
    destination();
    return;
  }
  clearTimers();
  pendingDestination = destination;
  newChallenge();
  gate.error = null;
  gate.shaking = false;
  gate.unlocked = false;
  gate.origin = origin;
  gate.open = true;
}

function succeed() {
  gate.unlocked = true;
  if (gate.rememberMode === 'session') gate.sessionUnlocked = true;
  if (gate.rememberMode === 'forever') {
    gate.foreverUnlocked = true;
    writeBool(STORAGE_KEYS.gateUnlockedForever, true);
  }
  successTimer = setTimeout(() => {
    const destination = pendingDestination;
    dismissGate();
    destination?.();
  }, GATE_SUCCESS_HOLD_MS);
}

function fail() {
  newChallenge();
  gate.error = GATE_ERROR_MESSAGE;
  gate.shaking = true;
  clearTimeout(errorTimer);
  clearTimeout(shakeTimer);
  errorTimer = setTimeout(() => (gate.error = null), GATE_ERROR_VISIBLE_MS);
  shakeTimer = setTimeout(() => (gate.shaking = false), GATE_SHAKE_MS);
}

/** Append a digit; auto-submits once the answer's digit count is reached. */
export function pressGateDigit(digit: number) {
  if (!gate.open || gate.unlocked) return;
  const answer = String(gate.x * gate.y);
  if (gate.input.length >= answer.length) return;
  gate.input += String(digit);
  if (gate.input.length < answer.length) return;
  if (gate.input === answer) succeed();
  else fail();
}

export function pressGateBackspace() {
  if (!gate.open || gate.unlocked) return;
  gate.input = gate.input.slice(0, -1);
}

/** Close without unlocking. Typed digits are discarded; the remember
 *  preference persists (it's a device setting, not per-attempt). */
export function dismissGate() {
  clearTimers();
  gate.open = false;
  gate.input = '';
  gate.error = null;
  gate.shaking = false;
  gate.unlocked = false;
  pendingDestination = null;
}

/** Selecting is instant; the choice only takes effect on a successful solve. */
export function setGateRememberMode(mode: GateRememberMode) {
  gate.rememberMode = mode;
  writeString(STORAGE_KEYS.gateRememberMode, mode);
}

/** Settings → Controls "on": clear every stored unlock and re-ask every time. */
export function resetParentalGate() {
  gate.sessionUnlocked = false;
  gate.foreverUnlocked = false;
  writeBool(STORAGE_KEYS.gateUnlockedForever, false);
  setGateRememberMode('always');
}

/** Settings → Controls "off": stop asking on this device. Reachable only from
 *  inside the already-gated Settings, so it's equivalent to solving with
 *  "Don't ask again" selected. */
export function disableParentalGate() {
  gate.foreverUnlocked = true;
  writeBool(STORAGE_KEYS.gateUnlockedForever, true);
  setGateRememberMode('forever');
}

// Re-read persisted gate state after the native durable layer restores values
// the WebView evicted (see hydrateDurableStorage).
export function reloadParentalGate() {
  gate.rememberMode = readRememberMode(gate.rememberMode);
  gate.foreverUnlocked = readBool(STORAGE_KEYS.gateUnlockedForever, gate.foreverUnlocked);
}

onDurableRestore(reloadParentalGate);
