import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE, TOUCH_TARGET } from '../drawing/theme';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { AI_STYLES, type AiStyle } from './contract';
import { AiStylePreview, AI_STYLE_TILE_WIDTH_PX, AI_STYLE_TILE_BORDER_PX } from './AiStylePreview';

export function NativeAiStyleChoices({
  selected,
  disabled,
  onChoose,
}: {
  selected: AiStyle;
  disabled: boolean;
  onChoose: (style: AiStyle) => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const controlStyles = useDrawingScreenStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="AI art style" style={styles.grid}>
      {AI_STYLES.map((style) => (
        <Pressable
          key={style}
          accessibilityRole="radio"
          accessibilityLabel={`${style} AI style`}
          accessibilityState={{ checked: selected === style, disabled }}
          aria-checked={selected === style}
          disabled={disabled}
          onPress={() => onChoose(style)}
          style={[
            styles.tile,
            selected === style && styles.selected,
            disabled && controlStyles.disabled,
          ]}
        >
          <AiStylePreview style={style} />
          <Text style={styles.text}>{style}</Text>
          <Text style={styles.text}>{selected === style ? 'Selected' : 'Choose'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: DRAWING_SCALE.space3 },
    tile: {
      width: AI_STYLE_TILE_WIDTH_PX,
      minHeight: TOUCH_TARGET,
      padding: DRAWING_SCALE.space2,
      gap: DRAWING_SCALE.space1,
      borderRadius: DRAWING_SCALE.radiusMd,
      borderWidth: AI_STYLE_TILE_BORDER_PX,
      borderColor: palette.paper,
      backgroundColor: palette.paper,
    },
    selected: { borderColor: palette.brandSolid, backgroundColor: palette.brandWash },
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
  })
);
