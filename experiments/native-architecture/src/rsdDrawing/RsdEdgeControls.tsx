import { useState, type ReactNode } from 'react';
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
import { NativeDrawingLayout, type LayoutAxis, type PaletteLayout } from './NativeScrollAreas';

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
  return (
    <NativeDrawingLayout
      palette={(layout) => (
        <RsdPalette screen={screen} sound={sound} layout={layout} disabled={paintsDisabled} />
      )}
      clear={
        <RsdAction
          label="Clear"
          icon="trash-closed"
          disabled={disabled}
          onClick={() => {
            void screen.clear();
          }}
        />
      }
      drawer={(axis) => <RsdToolDrawer axis={axis} {...controls} />}
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

function RsdToolDrawer({ axis, ...controls }: Controls & { axis: LayoutAxis }) {
  const [open, setOpen] = useState(false);
  return (
    <html.div style={[styles.drawer, axis === 'row' && styles.drawerRow]}>
      {open ? <RsdDrawerTools {...controls} /> : null}
      <RsdDrawerToggle axis={axis} open={open} onClick={() => setOpen(!open)} />
    </html.div>
  );
}

function RsdDrawerTools({ screen, sound, product, menu, disabled }: Controls) {
  const ink = paintAppearance(sound.settings.selectedColor, useDrawingAppearance()).hex;
  return (
    <>
      {screen.brushControl.kind === 'toggle' ? (
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
      ) : null}
      {sound.settings.coloringBookEnabled ? (
        <RsdAction
          label="Coloring pages"
          icon="shapes"
          disabled={disabled}
          onClick={() => screen.setPagePickerOpen(true)}
        />
      ) : null}
      <RsdAction
        label="Save picture"
        icon="camera"
        disabled={disabled}
        onClick={() => {
          void screen.save();
        }}
      />
      {sound.settings.aiEnabled ? <AiPictureAction ai={product.ai} disabled={disabled} /> : null}
      {sound.settings.undoButtonEnabled ? (
        <RsdAction
          label="Undo"
          icon="undo"
          disabled={disabled || screen.history.undo.length === 0}
          onClick={screen.undo}
        />
      ) : null}
      <RsdAction label="Drawing tools" icon="controls" disabled={disabled} onClick={menu.show} />
      <RsdAction
        label="Parent Center"
        icon="parent-center"
        disabled={disabled}
        onClick={() => product.owner?.openParentCenter()}
      />
    </>
  );
}

function AiPictureAction({
  ai,
  disabled,
}: {
  ai: ReturnType<typeof useNativeAi>;
  disabled: boolean;
}) {
  return (
    <RsdAction
      label="AI picture"
      icon="wand-stars"
      disabled={disabled}
      onClick={() => ai.owner?.open()}
    />
  );
}
