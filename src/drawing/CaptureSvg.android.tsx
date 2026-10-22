import { forwardRef, type ComponentProps } from 'react';
import { PixelRatio } from 'react-native';
import { Svg } from '../platform/svg';

// Android also paints the offscreen view to its display-density bitmap. Export dimensions remain
// explicit toDataURL pixels; laying those pixels out as dp multiplies the display allocation again.
export const CaptureSvg = forwardRef<
  Svg,
  ComponentProps<typeof Svg> & { width: number; height: number }
>(function CaptureSvg({ width, height, ...props }, ref) {
  const density = PixelRatio.get();
  return <Svg {...props} ref={ref} width={width / density} height={height / density} />;
});
