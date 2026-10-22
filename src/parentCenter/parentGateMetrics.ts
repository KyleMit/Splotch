import type { GateSizeClass } from '../rsdDrawing/modalGeometry';

// The shipping card's measures at each viewport step (ParentalGate.svelte, ParentalGateProblem.svelte,
// ParentalGateManageFooter.svelte); native-parent-center-parity.test.mjs reads them back.
export const PARENT_GATE_METRICS = {
  phone: {
    mascot: 54,
    operand: 54,
    dab: { width: 48, height: 54 },
    equationGap: 10,
    errorHeight: 18,
    successMinHeight: 300,
    footerIcon: 16,
  },
  phoneLandscape: {
    mascot: 42,
    operand: 48,
    dab: { width: 44, height: 48 },
    equationGap: 6,
    errorHeight: 16,
    successMinHeight: 240,
    footerIcon: 16,
  },
  tablet: {
    mascot: 64,
    operand: 58,
    dab: { width: 52, height: 58 },
    equationGap: 12,
    errorHeight: 20,
    successMinHeight: 340,
    footerIcon: 18,
  },
  largeTablet: {
    mascot: 76,
    operand: 60,
    dab: { width: 54, height: 60 },
    equationGap: 16,
    errorHeight: 20,
    successMinHeight: 380,
    footerIcon: 18,
  },
} as const satisfies Record<
  GateSizeClass,
  {
    mascot: number;
    operand: number;
    dab: { width: number; height: number };
    equationGap: number;
    errorHeight: number;
    successMinHeight: number;
    footerIcon: number;
  }
>;

// The shipping keypad's key height, glyph size and key gap at each of the gate's viewport steps
// (ParentalGateKeypad.svelte); native-parent-center-parity.test.mjs reads each back from that file.
export const PARENT_GATE_KEYPAD_METRICS = {
  phone: { keyHeight: 46, icon: 22, gap: 8, digits: 'lg', width: null },
  phoneLandscape: { keyHeight: 44, icon: 22, gap: 7, digits: 'lg', width: 216 },
  tablet: { keyHeight: 56, icon: 26, gap: 12, digits: 'xl', width: null },
  largeTablet: { keyHeight: 60, icon: 28, gap: 16, digits: 'xl', width: null },
} as const satisfies Record<
  GateSizeClass,
  { keyHeight: number; icon: number; gap: number; digits: 'lg' | 'xl'; width: number | null }
>;
