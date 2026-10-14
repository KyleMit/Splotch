import { NETWORK_ERROR_MESSAGE } from '../../../../web/src/lib/latestRequest';
import { FREE_LIMIT, type CredentialKind } from '../ai/contract';

// The shipping Settings › AI Art copy: settings/aiSettingsCopy.ts, AiKeyManager.svelte,
// AiValueProp.svelte and OpenAiKeyHowTo.svelte. aiSettingsCopy.ts reads a web build flag, so this
// module carries the strings rather than importing them; native-ai-settings-drift.test.mjs reads each one
// back from those sources.

export const AI_SETTINGS_COPY = {
  create: 'Create AI Images',
  createHelp: {
    off: 'Turns a finished drawing into an AI picture based on it.',
    on: 'A finished drawing can now be turned into an AI picture based on it.',
  },
  customization: 'Customize AI Style',
  customizationHelp:
    'Offers a small set of distinct styles to pick from before the picture is generated.',
  autoSave: 'Auto-Save AI Images',
  keyLabel: 'OpenAI API Key',
  codeLabel: 'Access Code',
  keyPlaceholder: 'Paste your OpenAI API key',
  maskedKeyLabel: 'Saved OpenAI API key (masked)',
  savedCodeLabel: 'Saved access code',
  save: 'Save',
  checking: 'Checking…',
  forget: 'Forget',
  checkingAllowance: 'Checking your free AI creations…',
  afterAllowance:
    'No setup is needed. After those are used, add your own OpenAI API key to keep creating.',
  allowanceUsedUp: `Your ${FREE_LIMIT} free AI creations are used up.`,
  addKeyToContinue: 'Add your own OpenAI API key to keep creating.',
  allowanceUnavailable:
    'Add your own OpenAI API key to create AI art while the free allowance is unavailable.',
  keyPromise:
    'Your key is saved only on this device, used only for pictures made here, and billed to your OpenAI account. We never keep a copy of it.',
  ownKeyLead: "You're using ",
  ownKeyStrong: 'your own OpenAI API key',
  ownKeyTail: '. Usage is billed to your OpenAI account. Forget the key any time to switch it off.',
  codeLead: 'You have ',
  codeStrong: 'special access',
  codeTail:
    ' via an access code — AI art is on us, no API key needed. Forget the code any time to remove it.',
} as const;

// The auto-save help names where the pictures go: the native apps save to the photo library, the
// web export downloads them (it has no folder picker, so shipping's chosen-folder half never
// applies).
export const AI_AUTO_SAVE_HELP = {
  native: 'Saves each AI picture and the drawing behind it to your photos',
  web: 'Saves each AI picture and the drawing behind it to your downloads',
} as const;

export function freeCreationsLeft(remaining: number) {
  return `${remaining} free AI ${remaining === 1 ? 'creation' : 'creations'} left.`;
}

export type CredentialVerdict = CredentialKind | 'retiredGeminiKey' | 'checkUnavailable';

export const KEY_MESSAGES = {
  invalid: {
    byok: "That key didn't work. Double-check it and try again.",
    managed: "That doesn't look like a valid key or access code. Please try again.",
    retiredGeminiKey:
      'That looks like a Google Gemini key. Splotch now uses OpenAI — create a key at platform.openai.com and paste that one instead.',
    checkUnavailable: "We couldn't check that key just now. Please try again.",
  } satisfies Record<CredentialVerdict, string>,
  saveFailed: {
    byok: 'Your key works, but could not be saved securely on this device. Close and reopen Splotch, then try again.',
    managed:
      'Your credential works, but could not be saved securely. Close and reopen Splotch, then try again.',
  } satisfies Record<CredentialKind, string>,
  accepted: {
    byok: 'Your key works and has been accepted!',
    managed: 'Access granted! You have special access — no API key needed.',
  } satisfies Record<CredentialKind, string>,
  forgetFailed: {
    byok: 'Your key could not be removed securely. Close and reopen Splotch, then try again.',
    managed:
      'Your access code could not be removed securely. Close and reopen Splotch, then try again.',
  } satisfies Record<CredentialKind, string>,
  unreachable: NETWORK_ERROR_MESSAGE,
} as const;

export const KEY_STORAGE_NOTE = {
  ios: "Your key is saved in this device's iOS Keychain — encrypted by the system and kept only on this device.",
  android:
    "Your key is saved in this device's Android Keystore — encrypted by the system and kept only on this device.",
  web: 'Your key is encrypted and stored only in this browser on this device.',
} as const;

export const AI_VALUE_PROP_COPY = {
  title: 'What turning this on does',
  body: 'One tap on a finished drawing, and it comes back as a storybook picture — same colors, same character, same big smile.',
  steps: [
    {
      number: 1,
      caption: 'They draw',
      alt: "A child's colorful crayon drawing of a smiling person",
    },
    {
      number: 2,
      caption: 'One magic tap',
      alt: 'The same drawing with the AI picture button glowing over it',
    },
    {
      number: 3,
      caption: 'Ta-da!',
      alt: 'The drawing transformed into a colorful storybook character',
    },
  ],
} as const;

export type AiValuePropCredential = 'byok' | 'managed' | 'none';

// The two reassurances under the steps, worded for whichever credential is saved and, with none,
// for the free pictures the last allowance check this session reported.
export function valuePropClaims(credential: AiValuePropCredential, freeRemaining: number) {
  if (credential === 'managed')
    return [
      "Your access code is saved — turn this on whenever you're ready.",
      'AI art is on us with your access code — no OpenAI key needed.',
    ] as const;
  if (credential === 'byok')
    return [
      'Your OpenAI key is saved and ready whenever you turn this on.',
      'Your key stays saved on this device only.',
    ] as const;
  const after = 'After that, use your own OpenAI key — saved on this device only.';
  if (freeRemaining === 0) return [`Your ${FREE_LIMIT} free pictures are used up.`, after] as const;
  if (freeRemaining < FREE_LIMIT)
    return [
      `You have ${freeRemaining} free ${freeRemaining === 1 ? 'picture' : 'pictures'} left — nothing to set up, no card.`,
      after,
    ] as const;
  return [
    `The first ${FREE_LIMIT} pictures are free — nothing to set up, no card.`,
    after,
  ] as const;
}

export const OPENAI_KEY_HOWTO_COPY = {
  summary: 'How do I get an OpenAI API key?',
  openLead: 'Open ',
  openLink: 'the OpenAI API keys page',
  signIn: 'Sign in, or create an OpenAI account.',
  verifyLead: 'Under ',
  verifyPlace: 'Settings → Organization',
  verifyMid: ', finish ',
  verifyStrong: 'verification',
  verifyRest: '. OpenAI requires it before any key can make pictures. Do this ',
  verifyBefore: 'before',
  verifyTail:
    ' the next step — a key made without it saves here perfectly and then fails when the picture button is tapped.',
  createLead: 'Click ',
  createStrong: 'Create new secret key',
  createMid: ', then copy it (it starts with ',
  createCode: 'sk-…',
  createTail: ') and paste it below. You only get to see it once.',
  note: 'OpenAI bills picture-making usage to your account at its own rates, and requires the account to have billing set up before a key can make pictures. Sent an access code by us instead? Paste that in the same box — it works there too.',
} as const;
