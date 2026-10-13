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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ink = paintAppearance(sound.settings.selectedColor, useDrawingAppearance()).hex;
  const clear = useClearGesture({
    disabled,
    drawing: screen.history.drawing,
    onClear: screen.clear,
    sound: sound.owner?.clear ?? null,
  });
  return (
    <NativeDrawingLayout
      palette={(layout) => (
        <RsdPalette screen={screen} sound={sound} layout={layout} disabled={paintsDisabled} />
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
        <RsdDrawerToggle axis={axis} open={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)} />
      )}
      drawerTools={drawerOpen ? drawerTools(controls, ink) : []}
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
  disabled,
}: {
  screen: Screen;
  sound: Sound;
  layout: PaletteLayout;
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
            selected={color === selectedColor}
            disabled={disabled}
            onClick={() => {
              screen.selectInkBrush();
              void sound.owner?.settings.setColor(color);
            }}
          />
        ))}
      </html.div>
      <RsdMoreColorsSwatch disabled={disabled} onClick={screen.openColorPicker} />
    </html.div>
  );
}

function drawerTools({ screen, sound, product, menu, disabled }: Controls, ink: string) {
  const tools: DrawerTool[] = [];
  const add = (node: ReactElement<{ label: string }>) =>
    tools.push({ label: node.props.label, node });
  const brush =
    screen.brushControl.kind === 'toggle' ? (
      <RsdAction
        label={BRUSHES[screen.brushControl.brush].label}
        icon={BRUSH_ICONS[screen.brushControl.brush]}
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
        disabled={disabled}
        onClick={() => screen.setPagePickerOpen(true)}
      />
    );
  add(
    <RsdAction
      label="Save picture"
      icon="camera"
      disabled={disabled}
      onClick={() => {
        void screen.save();
      }}
    />
  );
  if (sound.settings.aiEnabled)
    add(<AiPictureAction label="AI picture" ai={product.ai} disabled={disabled} />);
  if (sound.settings.undoButtonEnabled)
    add(
      <RsdAction
        label="Undo"
        icon="undo"
        disabled={disabled || screen.history.undo.length === 0}
        onClick={screen.undo}
      />
    );
  add(<RsdAction label="Drawing tools" icon="controls" disabled={disabled} onClick={menu.show} />);
  add(
    <RsdAction
      label="Parent Center"
      icon="parent-center"
      disabled={disabled}
      onClick={() => product.owner?.openParentCenter()}
    />
  );
  return tools;
}

function AiPictureAction({
  label,
  ai,
  disabled,
}: {
  label: string;
  ai: ReturnType<typeof useNativeAi>;
  disabled: boolean;
}) {
  return (
    <RsdAction
      label={label}
      icon="wand-stars"
      disabled={disabled}
      onClick={() => ai.owner?.open()}
    />
  );
}
