import { View } from 'react-native';
import type { HubTileFrameProps } from './HubTileFrame';

export function HubTileFrame({ onWidth, children }: HubTileFrameProps) {
  return <View onLayout={({ nativeEvent }) => onWidth(nativeEvent.layout.width)}>{children}</View>;
}
