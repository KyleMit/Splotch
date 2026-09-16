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
import { demandOverlay } from './overlayDemand';
import type { Origin } from './modal.svelte';
import {
  GATE_ESCALATION_QUIET_MS,
  GATE_LOCKOUT_ENDED_MESSAGE,
  GATE_LOCKOUT_MAX_MS,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
  gateLockoutDurationMs,
  gateLockoutMessage,
} from './parentalGateLockout';
import { readonlyView, type DeepReadonly } from './readonlyView';

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

function readPolicies(): Record<ParentalGateFeature, ParentalGateMode> {
  return Object.fromEntries(
    PARENTAL_GATE_FEATURES.map((feature) => [feature, readFeatureMode(feature)])
  ) as Record<ParentalGateFeature, ParentalGateMode>;
}

function unsolvedSession(): Record<ParentalGateFeature, boolean> {
  return Object.fromEntries(PARENTAL_GATE_FEATURES.map((feature) => [feature, false])) as Record<
    ParentalGateFeature,
    boolean
  >;
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

interface ParentalGateFields {
  policies: Record<ParentalGateFeature, ParentalGateMode>;
  sessionSolved: Record<ParentalGateFeature, boolean>;
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

interface ParentalGateMutators {
  requiresParentalGate(feature: ParentalGateFeature): boolean;
  requireParentalGate(
    feature: ParentalGateFeature,
    destination: () => void,
    origin?: Origin | null,
    options?: { immediate?: boolean }
  ): void;
  redirectGateToParentCenter(destination?: (origin: Origin | null) => void): void;
  pressGateDigit(digit: number): void;
  pressGateBackspace(): void;
  submitGateAnswer(): void;
  pressGateKey(key: GateKeypadKey): void;
  dismissGate(): void;
  setParentalGateMode(feature: ParentalGateFeature, mode: ParentalGateMode): void;
  isParentCenterUnprotected(): boolean;
  endsParentCenterProtection(feature: ParentalGateFeature, mode: ParentalGateMode): boolean;
  reloadParentalGate(): void;
}

export type ParentalGateState = DeepReadonly<ParentalGateFields> & ParentalGateMutators;

export function createParentalGate(): ParentalGateState {
  const s: ParentalGateFields = $state({
    policies: readPolicies(),
    sessionSolved: unsolvedSession(),
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
    wrongStreak: 0,
    lockouts: 0,
    lockoutUntil: null,
    escalationQuietSince: null,
    lockoutMessage: null,
    announcement: '',
  });
  const { policies, sessionSolved } = s;

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
    s.x = randomOperand();
    s.y = randomOperand();
    s.input = '';
  }

  function requiresParentalGate(feature: ParentalGateFeature): boolean {
    const mode = policies[feature];
    return mode === 'always' || (mode === 'session' && !sessionSolved[feature]);
  }

  function isParentCenterUnprotected(): boolean {
    return policies.parentCenter === 'never';
  }

  /** Close without recording a solve. Typed digits and the destination are discarded. */
  function dismissGate() {
    clearTimers();
    s.open = false;
    s.input = '';
    s.error = null;
    s.lockoutMessage = null;
    s.announcement = '';
    s.shaking = false;
    s.unlocked = false;
    s.feature = null;
    s.immediate = false;
    pendingDestination = null;
  }

  function succeed() {
    s.wrongStreak = 0;
    s.lockouts = 0;
    const feature = s.feature;
    if (feature && policies[feature] === 'session') sessionSolved[feature] = true;

    // External navigations run synchronously inside the solving tap's trusted event, or
    // the popup gets blocked — a deferred replay loses transient user activation,
    // and while the gate is open the anchor sits in an inert dialog underneath
    // it. No success card: the link just opens.
    if (s.immediate) {
      const destination = pendingDestination;
      dismissGate();
      destination?.();
      return;
    }
    s.unlocked = true;
    successTimer = setTimeout(() => {
      const destination = pendingDestination;
      dismissGate();
      destination?.();
    }, GATE_SUCCESS_HOLD_MS);
  }

  function announce(message: string) {
    clearTimeout(announceTimer);
    if (s.announcement !== message) {
      s.announcement = message;
      return;
    }
    s.announcement = '';
    announceTimer = setTimeout(() => (s.announcement = message), GATE_ANNOUNCE_DELAY_MS);
  }

  function endLockout() {
    clearTimeout(lockoutTickTimer);
    s.escalationQuietSince = s.lockoutUntil;
    s.lockoutUntil = null;
    s.lockoutMessage = null;
    if (s.open) announce(GATE_LOCKOUT_ENDED_MESSAGE);
  }

  // Checked against the clock rather than trusted to a timer, which stops while
  // a device sleeps and does not run at all while the card is closed. A clock
  // set backwards would otherwise stretch the pause past the longest one.
  function lockoutHolds() {
    if (s.lockoutUntil !== null) {
      s.lockoutUntil = Math.min(s.lockoutUntil, Date.now() + GATE_LOCKOUT_MAX_MS);
    }
    if (s.lockoutUntil !== null && Date.now() >= s.lockoutUntil) endLockout();
    return s.lockoutUntil !== null;
  }

  function tickLockout() {
    if (!lockoutHolds()) return;
    const remainingMs = s.lockoutUntil! - Date.now();
    s.lockoutMessage = gateLockoutMessage(remainingMs);
    clearTimeout(lockoutTickTimer);
    lockoutTickTimer = setTimeout(
      tickLockout,
      remainingMs % GATE_LOCKOUT_TICK_MS || GATE_LOCKOUT_TICK_MS
    );
  }

  function lockOut() {
    s.lockoutUntil = Date.now() + gateLockoutDurationMs(s.lockouts);
    s.wrongStreak = 0;
    s.lockouts += 1;
    clearTimeout(errorTimer);
    s.error = null;
    tickLockout();
    announce(s.lockoutMessage ?? '');
  }

  function decayQuietEscalation() {
    const quietSince = s.escalationQuietSince;
    if (quietSince !== null && Date.now() - quietSince >= GATE_ESCALATION_QUIET_MS) {
      s.wrongStreak = 0;
      s.lockouts = 0;
    }
    s.escalationQuietSince = Date.now();
  }

  function fail() {
    newChallenge();
    s.shaking = true;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (s.shaking = false), GATE_SHAKE_MS);
    decayQuietEscalation();
    s.wrongStreak += 1;
    if (s.wrongStreak >= GATE_WRONG_ANSWERS_BEFORE_LOCKOUT) {
      lockOut();
      return;
    }
    s.error = GATE_ERROR_MESSAGE;
    announce(GATE_ERROR_MESSAGE);
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      s.error = null;
      s.announcement = '';
    }, GATE_ERROR_VISIBLE_MS);
  }

  // Input taken while the card shakes would land on a problem the eye hasn't
  // caught up with, and nothing a grown-up does needs it.
  function acceptsInput() {
    return s.open && !s.unlocked && !s.shaking && !lockoutHolds();
  }

  /**
   * Append a digit. A digit past the answer's length counts as a wrong answer:
   * a grown-up stops when the dabs are full, and tapping on past them is how
   * random tapping looks.
   */
  function pressGateDigit(digit: number) {
    if (!acceptsInput()) return;
    if (s.input.length >= String(s.x * s.y).length) fail();
    else s.input += String(digit);
  }

  function pressGateBackspace() {
    if (!acceptsInput()) return;
    s.input = s.input.slice(0, -1);
  }

  /** Check the typed answer. Checking before every dab is filled is a wrong answer too. */
  function submitGateAnswer() {
    if (!acceptsInput()) return;
    const answer = String(s.x * s.y);
    if (s.input === answer) succeed();
    else fail();
  }

  const mutators: ParentalGateMutators = {
    requiresParentalGate,
    /**
     * Run `destination` behind one feature's configured gate. `origin` is the
     * tapped control's center for the modal fly-in. External navigation requests
     * an immediate handoff so the browser retains the solving tap's user activation.
     */
    requireParentalGate(feature, destination, origin = null, { immediate = false } = {}) {
      if (!requiresParentalGate(feature)) {
        destination();
        return;
      }
      clearTimers();
      const lockedOut = lockoutHolds();
      pendingDestination = destination;
      newChallenge();
      s.error = null;
      s.announcement = '';
      s.shaking = false;
      s.unlocked = false;
      s.feature = feature;
      s.immediate = immediate;
      s.origin = origin;
      s.open = true;
      demandOverlay('parentalGate');
      if (lockedOut) {
        tickLockout();
        announceTimer = setTimeout(
          () => (s.announcement = s.lockoutMessage ?? ''),
          GATE_ANNOUNCE_DELAY_MS
        );
      }
    },
    /**
     * The open challenge's other way out: stop asking for this operation and go
     * change the policy instead. Parent Center is itself a protected operation, so
     * rather than closing this challenge and stacking a second one over it, the
     * dialog is retargeted in place — same card, same problem, new destination — and
     * the solve that follows is Parent Center's own. Where Parent Center is set to
     * Never there is nothing left to solve, so the handoff runs immediately.
     */
    redirectGateToParentCenter(destination) {
      const origin = s.origin;
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
      s.feature = 'parentCenter';
      s.immediate = false;
      s.input = '';
      s.shaking = false;
      s.error = null;
      if (lockoutHolds()) tickLockout();
    },
    pressGateDigit,
    pressGateBackspace,
    submitGateAnswer,
    pressGateKey(key) {
      if (key === 'delete') pressGateBackspace();
      else if (key === GATE_CHECK_KEY) submitGateAnswer();
      else pressGateDigit(key);
    },
    dismissGate,
    setParentalGateMode(feature, mode) {
      if (!isAllowedParentalGateMode(feature, mode)) {
        throw new Error(`Unsupported parental gate mode: ${feature}/${mode}`);
      }
      if (policies[feature] !== mode) sessionSolved[feature] = false;
      policies[feature] = mode;
      writeString(POLICY_STORAGE_KEYS[feature], mode);
    },
    /**
     * Whether Parent Center itself currently opens with no challenge in front of
     * it. Drives the standing warning beside its policy: Settings is reachable
     * without a check by design (ADR-0094), so this one Never is what decides
     * whether every other policy on the device can be rewritten by whoever is
     * holding it.
     */
    isParentCenterUnprotected,
    /**
     * Whether applying `mode` to `feature` is the choice that removes that last
     * check — the one worth confirming before it persists. Already-unprotected is
     * not a change, so it earns no second confirmation.
     */
    endsParentCenterProtection(feature, mode) {
      return feature === 'parentCenter' && mode === 'never' && !isParentCenterUnprotected();
    },
    // Re-read persisted gate state after the native durable layer restores values
    // the WebView evicted (see hydrateDurableStorage).
    reloadParentalGate() {
      for (const feature of PARENTAL_GATE_FEATURES) {
        policies[feature] = readFeatureMode(feature, policies[feature]);
      }
    },
  };

  return readonlyView(s, mutators);
}

export const parentalGateState = createParentalGate();

export const {
  requiresParentalGate,
  requireParentalGate,
  redirectGateToParentCenter,
  pressGateDigit,
  pressGateBackspace,
  submitGateAnswer,
  pressGateKey,
  dismissGate,
  setParentalGateMode,
  isParentCenterUnprotected,
  endsParentCenterProtection,
} = parentalGateState;

onDurableRestore(parentalGateState.reloadParentalGate);
