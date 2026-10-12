import { createModal } from './modal.svelte';
import { lazyPluginModule } from '$lib/nativePlugin';

// Asked before the Android system Back leaves a canvas with ink on it.
export const leaveConfirmModal = createModal();

// The ternary keeps the import() itself out of the web bundle: Rollup retains a module-level
// thunk even when every caller is dead code there.
export const loadSystemBackPlugin = lazyPluginModule(() =>
  __IS_CAPACITOR__
    ? import('$lib/plugins/systemBack')
    : Promise.reject(new Error('native-only plugin'))
);

export async function leaveApp(): Promise<void> {
  const { SystemBack } = await loadSystemBackPlugin();
  await SystemBack.moveToBackground();
}
