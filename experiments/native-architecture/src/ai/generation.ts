import { NativeAiFlow } from './generationFlow';
import type { AiSessionDependencies } from './sessionContract';
export type { AiState } from './session';
export function createNativeAi(deps: AiSessionDependencies) {
  return new NativeAiFlow(deps);
}
export type NativeAiOwner = ReturnType<typeof createNativeAi>;
