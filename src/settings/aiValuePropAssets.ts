import type { ImageSourcePropType } from 'react-native';
import type { PaperTheme } from '../drawing/theme';
import step1Light from '../../assets/ai-value-prop/step-1.light.webp';
import step1Dark from '../../assets/ai-value-prop/step-1.dark.webp';
import step2Light from '../../assets/ai-value-prop/step-2.light.webp';
import step2Dark from '../../assets/ai-value-prop/step-2.dark.webp';
import step3Light from '../../assets/ai-value-prop/step-3.light.webp';
import step3Dark from '../../assets/ai-value-prop/step-3.dark.webp';

export type AiValuePropStep = 1 | 2 | 3;

// The shipping assets/static/ai-value-prop illustrations, bundled byte for byte
// (native-ai-settings-drift.test.mjs compares them).
const steps = {
  1: { light: step1Light, dark: step1Dark },
  2: { light: step2Light, dark: step2Dark },
  3: { light: step3Light, dark: step3Dark },
} satisfies Record<
  AiValuePropStep,
  Record<PaperTheme, number | string | { uri: string; width: number; height: number }>
>;

export function aiValuePropSource(step: AiValuePropStep, theme: PaperTheme): ImageSourcePropType {
  const source = steps[step][theme];
  return typeof source === 'string' ? { uri: source } : source;
}
