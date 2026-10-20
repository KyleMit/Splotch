import { forwardRef } from 'react';
import {
  requireNativeComponent,
  type NativeSyntheticEvent,
  type ViewProps,
  type ViewInstance,
} from 'react-native';
import type { InputSample } from './paperInput';

// Fabric interop rejects a wrapper hit; the native content view owns the paper's hit area.
type Props = Omit<ViewProps, 'pointerEvents'> & {
  onInput: (value: unknown) => void;
  onClaim: () => void;
  // Read only on web, where a prerendered shell can hold fingers down before the engine is ready.
  engineReady: () => boolean;
  // Read only on web, where a mouse or pen hovers over the paper.
  onHover: (sample: InputSample | null) => void;
  erasing: boolean;
};
type NativeProps = ViewProps & { onPaperInput?: (event: NativeSyntheticEvent<unknown>) => void };
const InputView = requireNativeComponent<NativeProps>('SplotchPaperInput');

export const PaperInputView = forwardRef<ViewInstance, Props>(function PaperInputView(
  { onInput, onClaim, engineReady: _engineReady, onHover: _onHover, erasing: _erasing, ...props },
  ref
) {
  return (
    <InputView
      {...props}
      ref={ref}
      onPaperInput={({ nativeEvent }) => {
        onClaim();
        onInput(nativeEvent);
      }}
    />
  );
});
