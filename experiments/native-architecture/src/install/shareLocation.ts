import { useWindowDimensions } from 'react-native';
import { iosShareButtonLocation } from '../../../../web/src/lib/iosShareButtonLocation';

export function useShareButtonLocation() {
  const { width, height } = useWindowDimensions();
  return iosShareButtonLocation(width, width > height ? 'landscape' : 'portrait');
}
