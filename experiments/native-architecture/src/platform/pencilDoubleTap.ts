import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

// Emitted by ios/HelloWorld/SplotchPencil.swift; native-pencil-double-tap.test.mjs reads both sides.
export const PENCIL_DOUBLE_TAP_EVENT = 'pencilDoubleTap';

type PencilEmitter = {
  addListener: (eventType: string) => void;
  removeListeners: (count: number) => void;
};

function isPencilEmitter(value: unknown): value is PencilEmitter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'addListener' in value &&
    typeof value.addListener === 'function' &&
    'removeListeners' in value &&
    typeof value.removeListeners === 'function'
  );
}

// Only iOS has the Pencil interaction; elsewhere there is nothing to hear.
export function subscribePencilDoubleTap(listener: () => void): () => void {
  const module: unknown = NativeModules.SplotchPencil;
  if (Platform.OS !== 'ios' || !isPencilEmitter(module)) return () => {};
  const subscription = new NativeEventEmitter(module).addListener(
    PENCIL_DOUBLE_TAP_EVENT,
    listener
  );
  return () => subscription.remove();
}
