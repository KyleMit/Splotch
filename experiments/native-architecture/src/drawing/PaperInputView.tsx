import { forwardRef } from 'react';
import {
  requireNativeComponent,
  type NativeSyntheticEvent,
  type View,
  type ViewProps,
} from 'react-native';

// Fabric interop rejects a wrapper hit; the native content view owns the paper's hit area.
type Props = Omit<ViewProps, 'pointerEvents'> & {
  onInput: (value: unknown) => void;
  onClaim: () => void;
};
type NativeProps = ViewProps & { onPaperInput?: (event: NativeSyntheticEvent<unknown>) => void };
const InputView = requireNativeComponent<NativeProps>('SplotchPaperInput');

export const PaperInputView = forwardRef<View, Props>(function PaperInputView(
  { onInput, onClaim, ...props },
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
