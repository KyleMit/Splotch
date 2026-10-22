import { useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet } from 'react-native';
import { TextInput } from '../drawing/Text';
import { DRAWING_BRAND, DRAWING_SCALE } from '../drawing/theme';
import {
  createDrawingStyles,
  useDrawingStyles,
  useDrawingTheme,
} from '../drawing/DrawingAppearance';

// The shipping field skin (AiKeyManager's .access-code-input, ReportFields' .report-textarea):
// padding 8/12 for a line, 10/12 for prose, and room for about four lines of a report. Exported
// for native-design-primitives-drift.test.mjs, which reads each from shipping.
const TEXT_AREA_MIN_HEIGHT_PX = 88;
const TEXT_AREA_PADDING_BLOCK_PX = 10;
const TEXT_AREA_LINE_HEIGHT = 1.5;

const themedStyles = createDrawingStyles((theme) =>
  StyleSheet.create({
    field: {
      paddingVertical: DRAWING_SCALE.space2,
      paddingHorizontal: DRAWING_SCALE.space3,
      borderWidth: DRAWING_SCALE.borderWidth,
      borderStyle: 'solid',
      borderColor: theme.borderWarmStrong,
      borderRadius: DRAWING_SCALE.radiusSm,
      backgroundColor: theme.surface,
      color: theme.textStrong,
      fontSize: DRAWING_SCALE.fontSizeMd,
    },
    area: {
      minHeight: TEXT_AREA_MIN_HEIGHT_PX,
      paddingVertical: TEXT_AREA_PADDING_BLOCK_PX,
      lineHeight: DRAWING_SCALE.fontSizeMd * TEXT_AREA_LINE_HEIGHT,
      textAlignVertical: 'top',
    },
    focused: {
      borderColor: DRAWING_BRAND,
      outlineColor: DRAWING_BRAND,
      outlineStyle: 'solid',
      outlineWidth: DRAWING_SCALE.focusRingWidth,
      outlineOffset: DRAWING_SCALE.focusRingOffset,
    },
  })
);

type FieldProps = Omit<
  ComponentPropsWithRef<typeof TextInput>,
  'style' | 'multiline' | 'placeholderTextColor'
>;

function SkinnedField({
  multiline,
  onFocus,
  onBlur,
  ...props
}: FieldProps & { multiline: boolean }) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      multiline={multiline}
      placeholderTextColor={theme.textSoft}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[styles.field, multiline && styles.area, focused && styles.focused]}
    />
  );
}

// A one-line field in the shipping input skin, typed text in the strong ink over a soft
// placeholder, its border taking the brand color and the focus ring while it has focus.
export function RsdTextField(props: FieldProps) {
  return <SkinnedField {...props} multiline={false} />;
}

// The same skin for prose: taller, with roomier padding and line height, wrapping from the top.
export function RsdTextArea(props: FieldProps) {
  return <SkinnedField {...props} multiline />;
}
