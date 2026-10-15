import { forwardRef } from 'react';
import {
  requireNativeComponent,
  type NativeSyntheticEvent,
  type View,
  type ViewProps,
} from 'react-native';

type Props = ViewProps & { onInput: (value: unknown) => void; onClaim: () => void };
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
