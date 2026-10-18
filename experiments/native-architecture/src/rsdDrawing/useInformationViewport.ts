import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useInformationViewport() {
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  return { top, height: Math.max(0, height - top - bottom) };
}
