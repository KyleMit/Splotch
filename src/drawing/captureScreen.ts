import { Dimensions } from 'react-native';

export function watchCaptureScreen(onChange?: () => void) {
  const screen = { ...Dimensions.get('screen') };
  if (
    ![screen.width, screen.height, screen.scale, screen.fontScale].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new Error('Picture capture has invalid screen metrics.');
  let changed = false;
  let disposed = false;
  const subscription = Dimensions.addEventListener('change', () => {
    changed = true;
    onChange?.();
  });
  return {
    screen,
    current() {
      const current = Dimensions.get('screen');
      return (
        !changed &&
        current.scale === screen.scale &&
        current.width === screen.width &&
        current.height === screen.height &&
        current.fontScale === screen.fontScale
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      subscription.remove();
    },
  };
}
