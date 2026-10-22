import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { css, html } from 'react-strict-dom';
import { hasPunchedBackground } from '../lib/ai/styles';
import { AI_STYLES, type AiStyle } from '../ai/contract';
import { aiStylePreviewSource } from '../ai/stylePreviewAssets';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { DialogHeader } from './DialogHeader';
import { ModalShell } from './ModalShell';
import { useDialogTitleId } from './dialogScope';
import { AI_PROMPT_LAYOUTS, aiPromptColumns, aiPromptStep } from './aiPromptGeometry';
import { focusRingHost, focusRingPart } from './focusRing';
import { MODAL_GUTTER_MIN_PX, modalFrame } from './modalGeometry';
import { RsdPressable } from './RsdPressable';
import { styles as controlStyles } from './controls';
import { brandColors, colors, dimensions, motion } from './tokens.css';

// AiImagePrompt.svelte's cover literals; native-ai-flow-geometry.test.mjs reads them back.
const AI_STYLE_THUMB_BORDER_PX = 3;
const AI_STYLE_THUMB_GAP_PX = 6;
const AI_STYLE_HOVER_LIFT_PX = 2;
const AI_STYLE_PRESSED_SCALE = 0.97;
// The cutout cover's sticker shadow, drawn around its silhouette rather than baked into the art.
export const AI_STYLE_CUTOUT_SHADOW = 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.28))';

const LEGEND = 'Pick a style';

// The shipping AI Style Prompt: a card over the drawing with the style covers under "Pick a
// style". A pick starts the picture at once and the AI Result takes over.
export function RsdAiStylePrompt({
  visible,
  onPick,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  onPick: (style: AiStyle) => void;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const window = useWindowDimensions();
  const layout = AI_PROMPT_LAYOUTS[aiPromptStep(window)];
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
      label={LEGEND}
      size="aiPrompt"
      onClose={onClose}
      header={<DialogHeader onClose={onClose} closeInset={layout.closeInset} />}
    >
      <StyleChoices onPick={onPick} />
    </ModalShell>
  );
}

function StyleChoices({ onPick }: { onPick: (style: AiStyle) => void }) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = AI_PROMPT_LAYOUTS[aiPromptStep(window)];
  const gutter = Math.max(MODAL_GUTTER_MIN_PX, insets.left, insets.right);
  const frame = modalFrame('aiPrompt', window, gutter);
  const columns = aiPromptColumns(window);
  const content = frame.width - 2 * layout.padding.inline;
  const tile = (content - (columns - 1) * layout.gridGap) / columns;
  const titleId = useDialogTitleId();
  return (
    <html.div style={styles.fieldset}>
      <html.h2
        id={titleId}
        style={[
          controlStyles.semiboldText,
          styles.legend(layout.legendGap),
          layout.legendSize === 'md' && styles.textMd,
        ]}
      >
        {LEGEND}
      </html.h2>
      <html.div style={styles.grid(layout.gridGap)}>
        {AI_STYLES.map((style) => (
          <StyleOption
            key={style}
            style={style}
            width={tile}
            labelSize={layout.labelSize}
            onPick={onPick}
          />
        ))}
      </html.div>
    </html.div>
  );
}

function StyleOption({
  style,
  width,
  labelSize,
  onPick,
}: {
  style: AiStyle;
  width: number;
  labelSize: 'sm' | 'md';
  onPick: (style: AiStyle) => void;
}) {
  const theme = useDrawingAppearance();
  const [hovered, setHovered] = useState(false);
  const cutout = hasPunchedBackground(style);
  return (
    <RsdPressable
      {...focusRingHost('part')}
      type="button"
      aria-label={style}
      style={styles.option(width, AI_STYLE_THUMB_GAP_PX)}
      onClick={() => onPick(style)}
      onPointerMove={(event: { pointerType?: string }) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <html.div
        {...focusRingPart('halo')}
        style={[
          styles.thumb(width, AI_STYLE_THUMB_BORDER_PX, `scale(${AI_STYLE_PRESSED_SCALE})`),
          !cutout && styles.plate,
          cutout && styles.cutout(AI_STYLE_CUTOUT_SHADOW),
          hovered &&
            styles.thumbHovered(
              `translateY(-${AI_STYLE_HOVER_LIFT_PX}px)`,
              `scale(${AI_STYLE_PRESSED_SCALE})`
            ),
        ]}
      >
        <Image
          accessible={false}
          source={aiStylePreviewSource(style, theme)}
          resizeMode="cover"
          style={cover.image}
        />
      </html.div>
      <html.span
        style={[
          controlStyles.semiboldText,
          styles.label,
          labelSize === 'md' && styles.textMd,
          hovered && styles.labelHovered,
        ]}
      >
        {style}
      </html.span>
    </RsdPressable>
  );
}

const cover = StyleSheet.create({ image: { width: '100%', height: '100%' } });

const styles = css.create({
  fieldset: { display: 'flex', flexDirection: 'column' },
  legend: (gap: number) => ({
    margin: 0,
    marginBottom: gap,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
  }),
  textMd: { fontSize: dimensions.fontSizeMd },
  grid: (gap: number) => ({ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap }),
  option: (width: number, gap: number) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap,
    width,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  }),
  thumb: (size: number, border: number, pressed: string) => ({
    boxSizing: 'border-box',
    width: size,
    height: size,
    overflow: 'hidden',
    borderRadius: dimensions.radiusMd,
    borderWidth: border,
    borderStyle: 'solid',
    borderColor: 'transparent',
    transform: { default: 'scale(1)', ':active': pressed },
    transitionProperty: 'transform, border-color',
    transitionDuration: motion.durationFast,
  }),
  plate: { backgroundColor: colors.paper },
  cutout: (shadow: string) => ({ overflow: 'visible', filter: shadow }),
  thumbHovered: (lift: string, pressed: string) => ({
    borderColor: brandColors.brand,
    transform: { default: lift, ':active': pressed },
  }),
  label: { color: colors.text, fontSize: dimensions.fontSizeSm, userSelect: 'none' },
  labelHovered: { color: colors.brandText },
});
