import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { MIN_TEXT_ZOOM, nextTextZoom } from '../../../../web/src/lib/actions/textZoom';
import { TextZoomRevision } from './textZoomRevision';

type Props = { children: ReactNode; enabled: boolean; onZoom?: (zoom: number) => void };
function spread(event: GestureResponderEvent) {
  const [first, second] = event.nativeEvent.touches;
  return second ? Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY) : 0;
}

export function SettingsTextZoom({ children, enabled, onZoom }: Props) {
  const [zoom, setZoom] = useState(MIN_TEXT_ZOOM);
  const [revision, setRevision] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const current = useRef(zoom);
  const pinch = useRef<{ zoom: number; spread: number; fingers: number } | null>(null);
  const apply = (value: number) => {
    current.current = value;
    setZoom(value);
    onZoom?.(value);
  };
  useEffect(() => {
    if (!enabled) {
      if (current.current !== MIN_TEXT_ZOOM || pinch.current !== null)
        setRevision((count) => count + 1);
      current.current = MIN_TEXT_ZOOM;
      pinch.current = null;
      setZoom(MIN_TEXT_ZOOM);
      onZoom?.(MIN_TEXT_ZOOM);
    }
  }, [enabled, onZoom]);
  const claim = (event: GestureResponderEvent) =>
    enabled && (pinch.current !== null || event.nativeEvent.touches.length >= 2);
  const begin = (event: GestureResponderEvent) => {
    pinch.current = {
      zoom: current.current,
      spread: spread(event),
      fingers: event.nativeEvent.touches.length,
    };
  };
  const move = (event: GestureResponderEvent) => {
    const active = pinch.current;
    const fingers = event.nativeEvent.touches.length;
    if (!active || fingers < 2) return;
    if (active.fingers !== fingers) {
      begin(event);
      return;
    }
    apply(nextTextZoom(active.zoom, active.spread, spread(event)));
  };
  const settle = () => {
    if (pinch.current === null) return;
    pinch.current = null;
    setRevision((count) => count + 1);
  };
  const end = (event: GestureResponderEvent) => {
    if (event.nativeEvent.touches.length === 0) settle();
    else if (event.nativeEvent.touches.length >= 2) begin(event);
  };
  return (
    <View
      testID="settings-text-zoom"
      onLayout={({ nativeEvent }) =>
        setSize((old) => ({ ...old, width: nativeEvent.layout.width }))
      }
      onStartShouldSetResponderCapture={claim}
      onMoveShouldSetResponderCapture={claim}
      onResponderGrant={begin}
      onResponderMove={move}
      onResponderStart={begin}
      onResponderEnd={end}
      onResponderRelease={settle}
      onResponderTerminate={settle}
      onResponderTerminationRequest={() => false}
      style={
        zoom === MIN_TEXT_ZOOM
          ? undefined
          : { height: size.height ? size.height * zoom : undefined }
      }
    >
      <View
        testID="settings-text-zoom-content"
        onLayout={({ nativeEvent }) =>
          setSize((old) => ({ ...old, height: nativeEvent.layout.height }))
        }
        style={{
          width: size.width ? size.width / zoom : '100%',
          transform: [{ scale: zoom }],
          transformOrigin: 'top left',
        }}
      >
        <TextZoomRevision value={revision}>{children}</TextZoomRevision>
      </View>
    </View>
  );
}
