import { useState, type ReactElement, type ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import type { useNativeAi } from '../ai/useNativeAi';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingMenu } from '../useDrawingMenu';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { BRUSHES, type Brush } from '../drawing/brushes';
import { paintAppearance, visiblePaints } from '../drawing/palette';
import { RsdAction, RsdDrawerToggle } from './controls';
import { RsdIconButton } from './RsdIconButton';
import { RsdMoreColorsSwatch, RsdPaintAction } from './RsdSwatch';
import { PALETTE_FLOWS, paletteSpacing, type PaletteFlow } from './paletteGeometry';
import { colors } from './tokens.css';
import type { NativeIconName } from './icons.generated';
import { useClearGesture } from '../clear/useClearGesture';
import { RsdClearOverlay } from './RsdClearControl';
import { RsdClearUnderlay } from './clearSurfaces';
import { NativeDrawingLayout, type DrawerTool, type PaletteLayout } from './NativeScrollAreas';
import { controlSize } from '../settings/buttonSize';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;
type Product = ReturnType<typeof useDrawingProduct>;
type Menu = ReturnType<typeof useDrawingMenu>;
type Controls = {
  screen: Screen;
  sound: Sound;
  product: Product;
  menu: Menu;
  disabled: boolean;
};
type SizedControls = Controls & { size: number };

const BRUSH_ICONS = {
  pen: 'brush-pen',
  crayon: 'brush-crayon',
  magic: 'brush-magic',
  eraser: 'brush-eraser',
} as const satisfies Record<Brush, NativeIconName>;

// The paper arrives as prebuilt children, so a drawer toggle re-renders only this layout
// and the overlay that reads the drawer state, never the strokes on the paper.
export function RsdEdgeLayout({
  paintsDisabled,
  status,
  children,
  paperOverlay,
  ...controls
}: Controls & {
  paintsDisabled: boolean;
  status: ReactNode;
  children: ReactNode;
  paperOverlay: (drawerOpen: boolean) => ReactNode;
}) {
  const { screen, sound, disabled } = controls;
  const size = controlSize(sound.settings.buttonScale);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ink = paintAppearance(sound.settings.selectedColor, useDrawingAppearance()).hex;
  const clear = useClearGesture({
    disabled,
    drawing: screen.history.drawing,
    // The same clear path as every other Clear, so Auto-Save on Delete keeps the picture first.
    onClear: () => screen.clear(sound.settings.saveOnDeleteEnabled),
    sound: sound.owner?.clear ?? null,
  });
  return (
    <NativeDrawingLayout
      controlSize={size}
      palette={(layout) => (
        <RsdPalette screen={screen} sound={sound} layout={layout} disabled={paintsDisabled} />
      )}
      clearUnderlay={(offset) => (
        <RsdClearUnderlay control={clear} drawing={screen.history.drawing} offset={offset} />
      )}
      clearOverlay={<RsdClearOverlay control={clear} disabled={disabled} />}
      drawerToggle={(axis) => (
        <RsdDrawerToggle
          axis={axis}
          size={size}
          open={drawerOpen}
          onClick={() => setDrawerOpen(!drawerOpen)}
        />
      )}
      drawerTools={drawerOpen ? drawerTools({ ...controls, size }, ink) : []}
      settings={
        <RsdIconButton
          skin="corner"
          label="Settings"
          icon="settings"
          onPress={() => {
            if (!disabled) screen.openSettings();
          }}
        />
      }
      status={status}
    >
      {children}
      {paperOverlay(drawerOpen)}
    </NativeDrawingLayout>
  );
}

// The shipping Color Palette's plate: the bar surface with a soft shadow cast onto the paper.
const paletteStyles = css.create({
  plate: (flow: PaletteFlow, column: boolean) => ({
    boxSizing: 'border-box',
    flexGrow: 1,
    width: column ? flow.extentPx : undefined,
    height: column ? undefined : flow.extentPx,
    paddingTop: column ? flow.endPaddingPx : flow.crossStartPaddingPx,
    paddingBottom: column ? flow.endPaddingPx : flow.crossEndPaddingPx,
    paddingLeft: column ? flow.crossStartPaddingPx : flow.endPaddingPx,
    paddingRight: column ? flow.crossEndPaddingPx : flow.endPaddingPx,
    boxShadow: flow.shadow,
    // A safe-area inset shortens the bar but not the viewport the trim counts from, so the
    // flow can overrun its far end; shipping clips it there.
    overflow: 'hidden',
  }),
  surface: { backgroundColor: colors.surface },
  flow: (column: boolean, gap: number) => ({
    display: 'flex',
    flexDirection: column ? 'column' : 'row',
    alignItems: 'center',
    gap,
  }),
});

function RsdPalette({
  screen,
  sound,
  layout,
  disabled,
}: {
  screen: Screen;
  sound: Sound;
  layout: PaletteLayout;
  disabled: boolean;
}) {
  const { selectedColor, customColors } = sound.settings;
  const column = layout.axis === 'column';
  const flow = PALETTE_FLOWS[layout.axis];
  const paints = visiblePaints(customColors, selectedColor, layout.slots - 1);
  const spacing = paletteSpacing(layout.length, layout.axis, paints.length + 1);
  return (
    <html.div
      data-testid="rsd-palette-plate"
      style={[
        paletteStyles.plate(flow, column),
        paletteStyles.surface,
        paletteStyles.flow(column, spacing),
      ]}
    >
      <html.div
        role="radiogroup"
        aria-label="Paint colors"
        style={paletteStyles.flow(column, spacing)}
      >
        {paints.map((color) => (
          <RsdPaintAction
            key={color}
            color={color}
            size={flow.swatchPx}
            selected={color === selectedColor}
            disabled={disabled}
            onClick={() => {
              screen.selectInkBrush();
              void sound.owner?.settings.setColor(color);
            }}
          />
        ))}
      </html.div>
      <RsdMoreColorsSwatch
        size={flow.swatchPx}
        disabled={disabled}
        onClick={screen.openColorPicker}
      />
    </html.div>
  );
}

function drawerTools({ screen, sound, product, menu, disabled, size }: SizedControls, ink: string) {
  const tools: DrawerTool[] = [];
  const add = (node: ReactElement<{ label: string }>) =>
    tools.push({ label: node.props.label, node });
  const brush =
    screen.brushControl.kind === 'toggle' ? (
      <RsdAction
        label={BRUSHES[screen.brushControl.brush].label}
        icon={BRUSH_ICONS[screen.brushControl.brush]}
        size={size}
        ink={ink}
        selection="switch"
        selected={screen.brush === screen.brushControl.brush}
        disabled={disabled}
        onClick={screen.toggleBrush}
      />
    ) : screen.brushControl.kind === 'menu' ? (
      <RsdAction
        label={`Brush: ${BRUSHES[screen.brush].label}`}
        icon={BRUSH_ICONS[screen.brush]}
        size={size}
        ink={ink}
        disabled={disabled}
        onClick={menu.show}
      />
    ) : null;
  if (brush) add(brush);
  if (sound.settings.coloringBookEnabled)
    add(
      <RsdAction
        label="Coloring pages"
        icon="shapes"
        size={size}
        disabled={disabled}
        onClick={() => screen.setPagePickerOpen(true)}
      />
    );
  add(
    <RsdAction
      label="Save picture"
      icon="camera"
      size={size}
      disabled={disabled}
      onClick={() => {
        void screen.save();
      }}
    />
  );
  if (sound.settings.aiEnabled)
    add(<AiPictureAction label="AI picture" ai={product.ai} size={size} disabled={disabled} />);
  if (sound.settings.undoButtonEnabled)
    add(
      <RsdAction
        label="Undo"
        icon="undo"
        size={size}
        disabled={disabled || screen.history.undo.length === 0}
        onClick={screen.undo}
      />
    );
  add(
    <RsdAction
      label="Drawing tools"
      icon="controls"
      size={size}
      disabled={disabled}
      onClick={menu.show}
    />
  );
  add(
    <RsdAction
      label="Parent Center"
      icon="parent-center"
      size={size}
      disabled={disabled}
      onClick={() => product.owner?.openParentCenter()}
    />
  );
  return tools;
}

function AiPictureAction({
  label,
  ai,
  size,
  disabled,
}: {
  label: string;
  ai: ReturnType<typeof useNativeAi>;
  size: number;
  disabled: boolean;
}) {
  return (
    <RsdAction
      label={label}
      icon="wand-stars"
      size={size}
      disabled={disabled}
      onClick={() => ai.owner?.open()}
    />
  );
}
