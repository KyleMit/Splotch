import { useState, type ReactElement, type ReactNode } from 'react';
import { html } from 'react-strict-dom';
import type { useNativeAi } from '../ai/useNativeAi';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingMenu } from '../useDrawingMenu';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { BRUSHES, type Brush } from '../drawing/brushes';
import { paintAppearance, visiblePaints } from '../drawing/palette';
import {
  RsdAction,
  RsdDrawerToggle,
  RsdMoreColorsSwatch,
  RsdPaintAction,
  styles,
} from './controls';
import type { NativeIconName } from './icons.generated';
import { useClearGesture } from '../clear/useClearGesture';
import { RsdClearButton, RsdClearUnderlay } from './RsdClearControl';
import { RsdClearCoachmark } from './RsdClearCoachmark';
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

export function RsdEdgeLayout({
  paintsDisabled,
  status,
  children,
  ...controls
}: Controls & { paintsDisabled: boolean; status: ReactNode; children: ReactNode }) {
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
        <RsdPalette
          screen={screen}
          sound={sound}
          layout={layout}
          size={size}
          disabled={paintsDisabled}
        />
      )}
      clear={<RsdClearButton control={clear} disabled={disabled} />}
      clearUnderlay={<RsdClearUnderlay control={clear} drawing={screen.history.drawing} />}
      clearCoachmark={
        <RsdClearCoachmark
          visible={clear.coachmark}
          radius={clear.radius}
          reduced={clear.reduced}
        />
      }
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
        <RsdAction
          label="Settings"
          icon="settings"
          disabled={disabled}
          onClick={screen.openSettings}
        />
      }
      status={status}
    >
      {children}
    </NativeDrawingLayout>
  );
}

function RsdPalette({
  screen,
  sound,
  layout,
  size,
  disabled,
}: {
  screen: Screen;
  sound: Sound;
  layout: PaletteLayout;
  size: number;
  disabled: boolean;
}) {
  const { selectedColor, customColors } = sound.settings;
  const column = layout.axis === 'column';
  return (
    <html.div style={[styles.paletteBar, column && styles.column]}>
      <html.div
        role="radiogroup"
        aria-label="Paint colors"
        style={[styles.paletteSwatches, column && styles.column]}
      >
        {visiblePaints(customColors, selectedColor, layout.slots - 1).map((color) => (
          <RsdPaintAction
            key={color}
            color={color}
            size={size}
            selected={color === selectedColor}
            disabled={disabled}
            onClick={() => {
              screen.selectInkBrush();
              void sound.owner?.settings.setColor(color);
            }}
          />
        ))}
      </html.div>
      <RsdMoreColorsSwatch size={size} disabled={disabled} onClick={screen.openColorPicker} />
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
