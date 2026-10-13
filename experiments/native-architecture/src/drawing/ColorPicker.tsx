import { DrawingModal as Modal } from '../platform/DrawingModal';
import { useModalAnimation } from './useModalAnimation';
import { createDrawingStyles, useDrawingAppearance, useDrawingStyles } from './DrawingAppearance';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { useEffect, useId, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  EXPLORER_COLUMNS,
  EXPLORER_ROWS,
  EXPLORER_TILES,
  exploreColor,
  isDiscreteColorActivation,
} from './colorExplorer';
import {
  paintAppearance,
  isCustomColor,
  MAX_CUSTOM_COLORS,
  type CustomColor,
  type PaintColor,
} from './palette';
import { measurePaper } from './measurePaper';
import { createPaperGeometry, paperLocation } from './paperGeometry';
import { DRAWING_ON_BRAND, DRAWING_SCALE, DRAWING_SCRIM, TOUCH_TARGET } from './theme';

const EXPLORER_SIZE_PX = EXPLORER_COLUMNS * TOUCH_TARGET;
const PICKER_MAX_WIDTH_PX = EXPLORER_SIZE_PX + DRAWING_SCALE.space4 * 2;
const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

export function ColorPicker({
  selected,
  onChoose,
  onClose,
}: {
  selected: PaintColor;
  onChoose: (color: PaintColor) => void;
  onClose: () => void;
}) {
  const animationType = useModalAnimation();
  const styles = useDrawingStyles(themedStyles);
  const {
    choice,
    draft,
    setDraft,
    exploring,
    field,
    refresh,
    geometry,
    cancel,
    sample,
    gesture,
    setExploring,
  } = useColorExploration(selected);
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible
      transparent
      animationType={animationType}
      accessibilityLabel="Color picker"
      onRequestClose={onClose}
    >
      <NativeFrame variant="overlay">
        <View style={styles.backdrop} onLayout={refresh}>
          <View accessibilityViewIsModal style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              Find your color
            </Text>
            <ScrollView
              scrollEnabled={!exploring}
              onScroll={refresh}
              onLayout={refresh}
              onContentSizeChange={refresh}
              contentContainerStyle={styles.content}
            >
              <Text style={styles.help}>Slide to explore. Lift to keep a color here.</Text>
              <View
                ref={field}
                role="group"
                accessibilityLabel="Color explorer"
                tabIndex={-1}
                collapsable={false}
                onLayout={refresh}
                style={styles.field}
                onStartShouldSetResponderCapture={() => geometry.current() !== null}
                onResponderGrant={(event) => {
                  event.preventDefault();
                  const touch = event.nativeEvent.touches[0];
                  if (!touch || event.nativeEvent.touches.length !== 1) return;
                  field.current?.focus();
                  gesture.current = { identifier: String(touch.identifier), previous: choice };
                  setExploring(true);
                  sample(event);
                }}
                onResponderStart={(event) => {
                  if (event.nativeEvent.touches.length !== 1) cancel();
                }}
                onResponderMove={(event) => {
                  event.preventDefault();
                  sample(event);
                }}
                onResponderRelease={(event) => sample(event, true)}
                onResponderTerminate={cancel}
                onResponderTerminationRequest={() => true}
              >
                <ColorGradient />
                {EXPLORER_TILES.map((tile) => (
                  <Pressable
                    key={tile.color}
                    accessibilityRole="button"
                    accessibilityLabel={`Explore ${tile.color}`}
                    aria-pressed={draft === tile.color}
                    accessibilityState={{ selected: draft === tile.color }}
                    onPress={(event) => {
                      if (isDiscreteColorActivation(event.nativeEvent)) setDraft(tile.color);
                    }}
                    style={styles.tile}
                  />
                ))}
              </View>
              <View style={styles.previewRow}>
                <View style={[styles.preview, { backgroundColor: draft }]} />
                <Text accessibilityLiveRegion="polite" style={styles.help}>
                  {draft}
                </Text>
              </View>
              <Text style={styles.help}>
                Use a color to keep it with your {MAX_CUSTOM_COLORS} most recent custom paints.
              </Text>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use color"
              disabled={exploring}
              onPress={() => onChoose(choice)}
              style={styles.use}
            >
              <Text style={styles.useText}>Use color</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
              <Text style={styles.help}>Keep drawing</Text>
            </Pressable>
          </View>
        </View>
      </NativeFrame>
    </Modal>
  );
}

function useColorExploration(selected: PaintColor) {
  const theme = useDrawingAppearance();
  const [choice, setChoice] = useState<PaintColor>(selected);
  const draft = exploreInitial(paintAppearance(choice, theme).hex.toUpperCase());
  function setDraft(color: CustomColor) {
    setChoice(color);
  }
  const [exploring, setExploring] = useState(false);
  const field = useRef<View>(null);
  const gesture = useRef<{ identifier: string; previous: PaintColor } | null>(null);
  function cancel() {
    if (gesture.current) setChoice(gesture.current.previous);
    gesture.current = null;
    setExploring(false);
  }
  const geometry = useRef(createPaperGeometry(cancel)).current;
  function refresh() {
    geometry.refresh((complete) => measurePaper(field.current, complete));
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        cancel();
        geometry.clear();
      } else refresh();
    });
    return () => {
      subscription.remove();
      geometry.clear();
    };
  }, []);
  function sample(event: GestureResponderEvent, ending = false) {
    const active = gesture.current;
    const touches = ending ? event.nativeEvent.changedTouches : event.nativeEvent.touches;
    const touch = touches.find((item) => String(item.identifier) === active?.identifier);
    if (!active || !touch || (!ending && touches.length !== 1)) {
      cancel();
      return;
    }
    const frame = geometry.current();
    const point = paperLocation(touch, frame);
    if (!point || !frame) {
      cancel();
      return;
    }
    setDraft(exploreColor(point.x, point.y, frame.width, frame.height));
    if (ending) {
      gesture.current = null;
      setExploring(false);
    }
  }
  return {
    choice,
    draft,
    setDraft,
    exploring,
    field,
    refresh,
    geometry,
    cancel,
    sample,
    gesture,
    setExploring,
  };
}

function ColorGradient() {
  const scope = `colors-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${scope}-hue`} x1="0%" y1="0%" x2="100%" y2="0%">
            {HUE_STOPS.map((color, index) => (
              <Stop key={index} offset={index / (HUE_STOPS.length - 1)} stopColor={color} />
            ))}
          </LinearGradient>
          <LinearGradient id={`${scope}-tone`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="50%" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="100%" stopColor="#000000" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${scope}-hue)`} />
        <Rect width="100%" height="100%" fill={`url(#${scope}-tone)`} />
      </Svg>
    </View>
  );
}

function exploreInitial(hex: string): CustomColor {
  if (!isCustomColor(hex)) throw new Error('Paint color is invalid.');
  return hex;
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: DRAWING_SCRIM,
      padding: DRAWING_SCALE.space2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      width: '100%',
      maxWidth: PICKER_MAX_WIDTH_PX,
      maxHeight: '95%',
      backgroundColor: palette.surface,
      borderRadius: DRAWING_SCALE.radiusLg,
      padding: DRAWING_SCALE.space4,
      gap: DRAWING_SCALE.space2,
    },
    title: {
      color: palette.textStrong,
      fontSize: DRAWING_SCALE.fontSizeXl,
      fontWeight: DRAWING_SCALE.fontWeightBold,
    },
    help: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
    content: { gap: DRAWING_SCALE.space3, alignItems: 'center' },
    field: {
      width: EXPLORER_SIZE_PX,
      height: EXPLORER_ROWS * TOUCH_TARGET,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    tile: { width: TOUCH_TARGET, height: TOUCH_TARGET },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: DRAWING_SCALE.space3 },
    preview: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: DRAWING_SCALE.radiusMd,
      borderWidth: 2,
      borderColor: palette.textStrong,
    },
    use: {
      minHeight: TOUCH_TARGET,
      borderRadius: DRAWING_SCALE.radiusMd,
      backgroundColor: palette.brandSolid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    useText: {
      color: DRAWING_ON_BRAND,
      fontSize: DRAWING_SCALE.fontSizeMd,
      fontWeight: DRAWING_SCALE.fontWeightSemibold,
    },
    close: {
      minHeight: TOUCH_TARGET,
      borderRadius: DRAWING_SCALE.radiusMd,
      borderWidth: 1,
      borderColor: palette.borderWarm,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
);
