import type { ParentGateKey } from '../parentCenter/parentGate';

// React Native reports hardware keys only to a focused text input on iOS and Android, so the
// Grown-Ups Only card there answers its keypad alone; the web build takes typed digits too
// (gateKeyboard.web.ts).
export function useGateKeyboard(_press: (key: ParentGateKey) => void) {}
