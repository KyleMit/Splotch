// Shipping's step badge dimensions are checked by native-design-primitives-drift.test.mjs.
export const STEP_NUMBER_SIZE_PX = { regular: 32, summary: 26, compact: 20, support: 24 } as const;
export type StepNumberSize = keyof typeof STEP_NUMBER_SIZE_PX;
