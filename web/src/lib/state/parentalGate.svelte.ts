import {
  STORAGE_KEYS,
  readBool,
  readString,
  writeString,
  onDurableRestore,
  type StorageKey,
} from '../storage';
import { getPlatform, type Platform } from '$lib/platform';
import { openParentCenterSettings } from './ui.svelte';
import type { Origin } from './modal.svelte';

// The Grown-Ups Only gate (App Store Guideline 5.1.4): an adult solves a
// multiplication problem on a keypad before a gated operation runs. Gates sit
// at the operation boundary, never in front of Settings as a whole (ADR-0094).
// Parent Center owns a separate persisted frequency for every protected
// operation; a session solve stays in memory and therefore resets on relaunch.

export const PARENTAL_GATE_FEATURES = [
  'aiImage',
  'imageReport',
  'externalLinks',
  'feedback',
  'parentCenter',
] as const;
export type ParentalGateFeature = (typeof PARENTAL_GATE_FEATURES)[number];

export const PARENTAL_GATE_MODES = ['always', 'session', 'never'] as const;
export type ParentalGateMode = (typeof PARENTAL_GATE_MODES)[number];

const POLICY_STORAGE_KEYS = {
  aiImage: STORAGE_KEYS.parentalGateAiImageMode,
  imageReport: STORAGE_KEYS.parentalGateImageReportMode,
  externalLinks: STORAGE_KEYS.parentalGateExternalLinksMode,
  feedback: STORAGE_KEYS.parentalGateFeedbackMode,
  parentCenter: STORAGE_KEYS.parentalGateParentCenterMode,
} as const satisfies Record<ParentalGateFeature, StorageKey>;

function isParentalGateMode(value: string | null): value is ParentalGateMode {
  return (PARENTAL_GATE_MODES as readonly (string | null)[]).includes(value);
}

export function isParentalGateModeAvailable(
  feature: ParentalGateFeature,
  mode: ParentalGateMode,
  platform: Platform
): boolean {
  return !(feature === 'externalLinks' && mode === 'never' && platform === 'ios');
}

function isAllowedParentalGateMode(
  feature: ParentalGateFeature,
  value: string | null
): value is ParentalGateMode {
  return isParentalGateMode(value) && isParentalGateModeAvailable(feature, value, getPlatform());
}

// Gates are an app-store requirement (App Store Guideline 5.1.4 and the Kids
// Category, Google Play Families), so only a store build ships with them armed.
// The web app is distributed by URL rather than reviewed by a store: it starts
// with every check off and treats each one as an opt-in a parent switches on in
// Parent Center, so a toddler's first tap on the web is never a math problem.
// Build-time, not runtime — CAPACITOR=true is the single web-vs-native signal.
export const DEFAULT_PARENTAL_GATE_MODE: ParentalGateMode = __IS_CAPACITOR__ ? 'always' : 'never';

// The single remember-this-choice gate that predates Parent Center's per-feature
// policies. With neither key written there is nothing to migrate, so the caller
// falls through to the build's default instead of inventing a stricter one.
function legacyAiImageMode(): ParentalGateMode | null {
  if (readBool(STORAGE_KEYS.legacyGateUnlockedForever, false)) return 'never';
  const rememberMode = readString(STORAGE_KEYS.legacyGateRememberMode, null);
  if (rememberMode === null) return null;
  return rememberMode === 'session' ? 'session' : 'always';
}

function readFeatureMode(
  feature: ParentalGateFeature,
  fallback: ParentalGateMode = DEFAULT_PARENTAL_GATE_MODE
): ParentalGateMode {
  const stored = readString(POLICY_STORAGE_KEYS[feature], null);
  if (isAllowedParentalGateMode(feature, stored)) return stored;
  if (feature === 'aiImage') {
    const legacy = legacyAiImageMode();
    if (legacy) return legacy;
  }
  return isAllowedParentalGateMode(feature, fallback) ? fallback : 'always';
}

export const parentalGatePolicies: Record<ParentalGateFeature, ParentalGateMode> = $state(
  Object.fromEntries(
    PARENTAL_GATE_FEATURES.map((feature) => [feature, readFeatureMode(feature)])
  ) as Record<ParentalGateFeature, ParentalGateMode>
);

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
  feature: ParentalGateFeature | null;
  /** External navigation must run inside the solving tap's user activation. */
  immediate: boolean;
  /** In-memory only, so an app relaunch always re-asks for per-session features. */
  sessionSolved: Record<ParentalGateFeature, boolean>;
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
  feature: null,
  immediate: false,
  sessionSolved: Object.fromEntries(
    PARENTAL_GATE_FEATURES.map((feature) => [feature, false])
  ) as Record<ParentalGateFeature, boolean>,
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

/** Exported so unit tests can assert the policy decision without opening the modal. */
export function requiresParentalGate(feature: ParentalGateFeature): boolean {
  const mode = parentalGatePolicies[feature];
  return mode === 'always' || (mode === 'session' && !gate.sessionSolved[feature]);
}

/**
 * Run `destination` behind one feature's configured gate. `origin` is the
 * tapped control's center for the modal fly-in. External navigation requests
 * an immediate handoff so the browser retains the solving tap's user activation.
 */
export function requireParentalGate(
  feature: ParentalGateFeature,
  destination: () => void,
  origin: Origin | null = null,
  { immediate = false }: { immediate?: boolean } = {}
) {
  if (!requiresParentalGate(feature)) {
    destination();
    return;
  }
  clearTimers();
  pendingDestination = destination;
  newChallenge();
  gate.error = null;
  gate.shaking = false;
  gate.unlocked = false;
  gate.feature = feature;
  gate.immediate = immediate;
  gate.origin = origin;
  gate.open = true;
}

/**
 * The open challenge's other way out: stop asking for this operation and go
 * change the policy instead. Parent Center is itself a protected operation, so
 * rather than closing this challenge and stacking a second one over it, the
 * dialog is retargeted in place — same card, same problem, new destination — and
 * the solve that follows is Parent Center's own. Where Parent Center is set to
 * Never there is nothing left to solve, so the handoff runs immediately.
 */
export function redirectGateToParentCenter() {
  const origin = gate.origin;
  const destination = () => openParentCenterSettings(origin);
  if (!requiresParentalGate('parentCenter')) {
    dismissGate();
    destination();
    return;
  }
  clearTimers();
  pendingDestination = destination;
  gate.feature = 'parentCenter';
  gate.immediate = false;
  gate.input = '';
  gate.error = null;
  gate.shaking = false;
}

function succeed() {
  const feature = gate.feature;
  if (feature && parentalGatePolicies[feature] === 'session') gate.sessionSolved[feature] = true;

  // External navigations run synchronously inside the solving tap's trusted event, or
  // the popup gets blocked — a deferred replay loses transient user activation,
  // and while the gate is open the anchor sits in an inert dialog underneath
  // it. No success card: the link just opens.
  if (gate.immediate) {
    const destination = pendingDestination;
    dismissGate();
    destination?.();
    return;
  }
  gate.unlocked = true;
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

/** Close without recording a solve. Typed digits and the destination are discarded. */
export function dismissGate() {
  clearTimers();
  gate.open = false;
  gate.input = '';
  gate.error = null;
  gate.shaking = false;
  gate.unlocked = false;
  gate.feature = null;
  gate.immediate = false;
  pendingDestination = null;
}

export function setParentalGateMode(feature: ParentalGateFeature, mode: ParentalGateMode) {
  if (!isAllowedParentalGateMode(feature, mode)) {
    throw new Error(`Unsupported parental gate mode: ${feature}/${mode}`);
  }
  if (parentalGatePolicies[feature] !== mode) gate.sessionSolved[feature] = false;
  parentalGatePolicies[feature] = mode;
  writeString(POLICY_STORAGE_KEYS[feature], mode);
}

// Re-read persisted gate state after the native durable layer restores values
// the WebView evicted (see hydrateDurableStorage).
export function reloadParentalGate() {
  for (const feature of PARENTAL_GATE_FEATURES) {
    parentalGatePolicies[feature] = readFeatureMode(feature, parentalGatePolicies[feature]);
  }
}

onDurableRestore(reloadParentalGate);
