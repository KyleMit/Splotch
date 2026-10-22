import { useWindowDimensions } from '../platform/windowDimensions';
import { iosShareButtonLocation } from '../lib/iosShareButtonLocation';

export function useShareButtonLocation() {
  const { width, height } = useWindowDimensions();
  return iosShareButtonLocation(width, width > height ? 'landscape' : 'portrait');
}
