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
import {
  GATE_ESCALATION_QUIET_MS,
  GATE_LOCKOUT_ENDED_MESSAGE,
  GATE_LOCKOUT_MAX_MS,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
  gateLockoutDurationMs,
  gateLockoutMessage,
} from './parentalGateLockout';

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

export const parentalGatePoliciesState: Record<ParentalGateFeature, ParentalGateMode> = $state(
  Object.fromEntries(
    PARENTAL_GATE_FEATURES.map((feature) => [feature, readFeatureMode(feature)])
  ) as Record<ParentalGateFeature, ParentalGateMode>
);

/**
 * Whether Parent Center itself currently opens with no challenge in front of
 * it. Drives the standing warning beside its policy: Settings is reachable
 * without a check by design (ADR-0094), so this one Never is what decides
 * whether every other policy on the device can be rewritten by whoever is
 * holding it.
 */
export function isParentCenterUnprotected(): boolean {
  return parentalGatePoliciesState.parentCenter === 'never';
}

/**
 * Whether applying `mode` to `feature` is the choice that removes that last
 * check — the one worth confirming before it persists. Already-unprotected is
 * not a change, so it earns no second confirmation.
 */
export function endsParentCenterProtection(
  feature: ParentalGateFeature,
  mode: ParentalGateMode
): boolean {
  return feature === 'parentCenter' && mode === 'never' && !isParentCenterUnprotected();
}

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

// A live region speaks only for a change it sees: a lockout already in force
// is announced this long after the card opens, and a message repeated while it
// is still showing is cleared and set again this long later.
export const GATE_ANNOUNCE_DELAY_MS = 150;
// The countdown re-renders on each whole second remaining while the card is open.
const GATE_LOCKOUT_TICK_MS = 1000;

export const GATE_CHECK_KEY = 'submit';
export const GATE_KEYPAD_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 'delete', GATE_CHECK_KEY] as const;
type GateKeypadKey = (typeof GATE_KEYPAD_KEYS)[number];

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
  /** Wrong answers since the last solve, lockout, or quiet period. Survives closing the card. */
  wrongStreak: number;
  /** Lockouts since the last solve or quiet period; sets how long the next one lasts. */
  lockouts: number;
  /** Wall-clock end of the lockout in force, or null while the keypad accepts input. */
  lockoutUntil: number | null;
  /** When the escalation last saw a wrong answer or a lockout end; quiet runs from here. */
  escalationQuietSince: number | null;
  /** The visible countdown while a lockout holds; ticks only while the card is open. */
  lockoutMessage: string | null;
  /** Screen-reader text: set at the moments worth saying, never on each countdown tick. */
  announcement: string;
}

export const parentalGateState: ParentalGateState = $state({
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
  wrongStreak: 0,
  lockouts: 0,
  lockoutUntil: null,
  escalationQuietSince: null,
  lockoutMessage: null,
  announcement: '',
});

// Per-attempt continuation and timer handles — deliberately untracked: nothing
// renders them, and dismissGate() (reachable from every path) resets them.
let pendingDestination: (() => void) | null = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;
let shakeTimer: ReturnType<typeof setTimeout> | undefined;
let successTimer: ReturnType<typeof setTimeout> | undefined;
let lockoutTickTimer: ReturnType<typeof setTimeout> | undefined;
let announceTimer: ReturnType<typeof setTimeout> | undefined;

// A lockout itself is a deadline, not a timer, so clearing these on close
// never ends one: it only stops the countdown nobody can see.
function clearTimers() {
  clearTimeout(errorTimer);
  clearTimeout(shakeTimer);
  clearTimeout(successTimer);
  clearTimeout(lockoutTickTimer);
  clearTimeout(announceTimer);
}

function randomOperand() {
  return GATE_OPERAND_MIN + Math.floor(Math.random() * (GATE_OPERAND_MAX - GATE_OPERAND_MIN + 1));
}

// A fresh problem on every attempt keeps a child from brute-forcing one answer.
function newChallenge() {
  parentalGateState.x = randomOperand();
  parentalGateState.y = randomOperand();
  parentalGateState.input = '';
}

/** Exported so unit tests can assert the policy decision without opening the modal. */
export function requiresParentalGate(feature: ParentalGateFeature): boolean {
  const mode = parentalGatePoliciesState[feature];
  return mode === 'always' || (mode === 'session' && !parentalGateState.sessionSolved[feature]);
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
  const lockedOut = lockoutHolds();
  pendingDestination = destination;
  newChallenge();
  parentalGateState.error = null;
  parentalGateState.announcement = '';
  parentalGateState.shaking = false;
  parentalGateState.unlocked = false;
  parentalGateState.feature = feature;
  parentalGateState.immediate = immediate;
  parentalGateState.origin = origin;
  parentalGateState.open = true;
  if (lockedOut) {
    tickLockout();
    announceTimer = setTimeout(
      () => (parentalGateState.announcement = parentalGateState.lockoutMessage ?? ''),
      GATE_ANNOUNCE_DELAY_MS
    );
  }
}

/**
 * The open challenge's other way out: stop asking for this operation and go
 * change the policy instead. Parent Center is itself a protected operation, so
 * rather than closing this challenge and stacking a second one over it, the
 * dialog is retargeted in place — same card, same problem, new destination — and
 * the solve that follows is Parent Center's own. Where Parent Center is set to
 * Never there is nothing left to solve, so the handoff runs immediately.
 */
export function redirectGateToParentCenter(destination?: (origin: Origin | null) => void) {
  const origin = parentalGateState.origin;
  const openPolicies = () => {
    if (destination) destination(origin);
    else openParentCenterSettings(origin);
  };
  if (!requiresParentalGate('parentCenter')) {
    dismissGate();
    openPolicies();
    return;
  }
  clearTimers();
  pendingDestination = openPolicies;
  parentalGateState.feature = 'parentCenter';
  parentalGateState.immediate = false;
  parentalGateState.input = '';
  parentalGateState.shaking = false;
  parentalGateState.error = null;
  if (lockoutHolds()) tickLockout();
}

function succeed() {
  parentalGateState.wrongStreak = 0;
  parentalGateState.lockouts = 0;
  const feature = parentalGateState.feature;
  if (feature && parentalGatePoliciesState[feature] === 'session')
    parentalGateState.sessionSolved[feature] = true;

  // External navigations run synchronously inside the solving tap's trusted event, or
  // the popup gets blocked — a deferred replay loses transient user activation,
  // and while the gate is open the anchor sits in an inert dialog underneath
  // it. No success card: the link just opens.
  if (parentalGateState.immediate) {
    const destination = pendingDestination;
    dismissGate();
    destination?.();
    return;
  }
  parentalGateState.unlocked = true;
  successTimer = setTimeout(() => {
    const destination = pendingDestination;
    dismissGate();
    destination?.();
  }, GATE_SUCCESS_HOLD_MS);
}

function endLockout() {
  clearTimeout(lockoutTickTimer);
  parentalGateState.escalationQuietSince = parentalGateState.lockoutUntil;
  parentalGateState.lockoutUntil = null;
  parentalGateState.lockoutMessage = null;
  if (parentalGateState.open) announce(GATE_LOCKOUT_ENDED_MESSAGE);
}

function announce(message: string) {
  clearTimeout(announceTimer);
  if (parentalGateState.announcement !== message) {
    parentalGateState.announcement = message;
    return;
  }
  parentalGateState.announcement = '';
  announceTimer = setTimeout(
    () => (parentalGateState.announcement = message),
    GATE_ANNOUNCE_DELAY_MS
  );
}

// Checked against the clock rather than trusted to a timer, which stops while
// a device sleeps and does not run at all while the card is closed. A clock
// set backwards would otherwise stretch the pause past the longest one.
function lockoutHolds() {
  if (parentalGateState.lockoutUntil !== null) {
    parentalGateState.lockoutUntil = Math.min(
      parentalGateState.lockoutUntil,
      Date.now() + GATE_LOCKOUT_MAX_MS
    );
  }
  if (parentalGateState.lockoutUntil !== null && Date.now() >= parentalGateState.lockoutUntil)
    endLockout();
  return parentalGateState.lockoutUntil !== null;
}

function tickLockout() {
  if (!lockoutHolds()) return;
  const remainingMs = parentalGateState.lockoutUntil! - Date.now();
  parentalGateState.lockoutMessage = gateLockoutMessage(remainingMs);
  clearTimeout(lockoutTickTimer);
  lockoutTickTimer = setTimeout(
    tickLockout,
    remainingMs % GATE_LOCKOUT_TICK_MS || GATE_LOCKOUT_TICK_MS
  );
}

function lockOut() {
  parentalGateState.lockoutUntil = Date.now() + gateLockoutDurationMs(parentalGateState.lockouts);
  parentalGateState.wrongStreak = 0;
  parentalGateState.lockouts += 1;
  clearTimeout(errorTimer);
  parentalGateState.error = null;
  tickLockout();
  announce(parentalGateState.lockoutMessage ?? '');
}

function decayQuietEscalation() {
  const quietSince = parentalGateState.escalationQuietSince;
  if (quietSince !== null && Date.now() - quietSince >= GATE_ESCALATION_QUIET_MS) {
    parentalGateState.wrongStreak = 0;
    parentalGateState.lockouts = 0;
  }
  parentalGateState.escalationQuietSince = Date.now();
}

function fail() {
  newChallenge();
  parentalGateState.shaking = true;
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => (parentalGateState.shaking = false), GATE_SHAKE_MS);
  decayQuietEscalation();
  parentalGateState.wrongStreak += 1;
  if (parentalGateState.wrongStreak >= GATE_WRONG_ANSWERS_BEFORE_LOCKOUT) {
    lockOut();
    return;
  }
  parentalGateState.error = GATE_ERROR_MESSAGE;
  announce(GATE_ERROR_MESSAGE);
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    parentalGateState.error = null;
    parentalGateState.announcement = '';
  }, GATE_ERROR_VISIBLE_MS);
}

// Input taken while the card shakes would land on a problem the eye hasn't
// caught up with, and nothing a grown-up does needs it.
function acceptsInput() {
  return (
    parentalGateState.open &&
    !parentalGateState.unlocked &&
    !parentalGateState.shaking &&
    !lockoutHolds()
  );
}

/**
 * Append a digit. A digit past the answer's length counts as a wrong answer:
 * a grown-up stops when the dabs are full, and tapping on past them is how
 * random tapping looks.
 */
export function pressGateDigit(digit: number) {
  if (!acceptsInput()) return;
  if (parentalGateState.input.length >= String(parentalGateState.x * parentalGateState.y).length)
    fail();
  else parentalGateState.input += String(digit);
}

export function pressGateBackspace() {
  if (!acceptsInput()) return;
  parentalGateState.input = parentalGateState.input.slice(0, -1);
}

/** Check the typed answer. Checking before every dab is filled is a wrong answer too. */
export function submitGateAnswer() {
  if (!acceptsInput()) return;
  const answer = String(parentalGateState.x * parentalGateState.y);
  if (parentalGateState.input === answer) succeed();
  else fail();
}

export function pressGateKey(key: GateKeypadKey) {
  if (key === 'delete') pressGateBackspace();
  else if (key === GATE_CHECK_KEY) submitGateAnswer();
  else pressGateDigit(key);
}

/** Close without recording a solve. Typed digits and the destination are discarded. */
export function dismissGate() {
  clearTimers();
  parentalGateState.open = false;
  parentalGateState.input = '';
  parentalGateState.error = null;
  parentalGateState.lockoutMessage = null;
  parentalGateState.announcement = '';
  parentalGateState.shaking = false;
  parentalGateState.unlocked = false;
  parentalGateState.feature = null;
  parentalGateState.immediate = false;
  pendingDestination = null;
}

export function setParentalGateMode(feature: ParentalGateFeature, mode: ParentalGateMode) {
  if (!isAllowedParentalGateMode(feature, mode)) {
    throw new Error(`Unsupported parental gate mode: ${feature}/${mode}`);
  }
  if (parentalGatePoliciesState[feature] !== mode) parentalGateState.sessionSolved[feature] = false;
  parentalGatePoliciesState[feature] = mode;
  writeString(POLICY_STORAGE_KEYS[feature], mode);
}

// Re-read persisted gate state after the native durable layer restores values
// the WebView evicted (see hydrateDurableStorage).
export function reloadParentalGate() {
  for (const feature of PARENTAL_GATE_FEATURES) {
    parentalGatePoliciesState[feature] = readFeatureMode(
      feature,
      parentalGatePoliciesState[feature]
    );
  }
}

onDurableRestore(reloadParentalGate);
