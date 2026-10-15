import { useState, type ComponentProps, type ReactNode } from 'react';
import { drawingPaper } from '../drawing/paperSpace';
import { StyleSheet, View } from 'react-native';
import { css, html } from 'react-strict-dom';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { paintAppearance, visiblePaints } from '../drawing/palette';
import { RsdIconButton } from './RsdIconButton';
import { RsdMoreColorsSwatch, RsdPaintAction } from './RsdSwatch';
import {
  PALETTE_FLOWS,
  columnEndClearance,
  paletteSpacing,
  type PaletteFlow,
} from './paletteGeometry';
import { colors } from './tokens.css';
import { useClearGesture } from '../clear/useClearGesture';
import { RsdClearOverlay } from './RsdClearControl';
import { RsdClearUnderlay } from './clearSurfaces';
import { NativeDrawingLayout, type PaletteLayout } from './NativeScrollAreas';
import { RsdActionsPanel, useFlyoutSlot } from './RsdActionsPanel';
import { RsdFullscreenToggle } from './RsdFullscreenToggle';
import { useFullscreen } from '../platform/useFullscreen';
import { InertRegion, ToolbarSkin } from './toolbarSkin';
import type { PanelGlass } from './bareGlassLayout';
import { drawerOpenStorage } from '../platform/drawerOpen';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;
type Product = ReturnType<typeof useDrawingProduct>;
type Controls = {
  screen: Screen;
  sound: Sound;
  product: Product;
  disabled: boolean;
};

// The Fullscreen Toggle sits under the rest of the chrome, in the paper area's own layer.
const paperLayer = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});

// Shipping's drawerOpen default (BOOL_SETTINGS in settings.svelte.ts): a first launch starts with
// the Tool Drawer closed. rsd-native-drawer-open.test.mjs reads it from shipping.
const DEFAULT_DRAWER_OPEN = false;

// Shipping's readBool: only the two spellings writeBool writes count, and an unreadable store or
// any other value is the default.
function storedDrawerOpen() {
  try {
    const stored = drawerOpenStorage.read();
    return stored === 'true' || (stored !== 'false' && DEFAULT_DRAWER_OPEN);
  } catch {
    return DEFAULT_DRAWER_OPEN;
  }
}

// The drawer a child last opened or closed, as shipping remembers it across launches. Read while
// the layout first renders, so a cold start shows the remembered drawer without opening it.
function useRememberedDrawer() {
  const [open, setOpen] = useState(storedDrawerOpen);
  const choose = (next: boolean) => {
    try {
      drawerOpenStorage.write(next ? 'true' : 'false');
    } catch {
      /* As shipping's writeBool: the drawer still turns, and only the next launch loses it. */
    }
    setOpen(next);
  };
  return [open, choose] as const;
}

// The paper arrives as prebuilt children, so a drawer toggle re-renders only this layout
// and the overlay that reads the drawer state, never the strokes on the paper.
export function RsdEdgeLayout({
  covered,
  buttonScale,
  resizing,
  status,
  children,
  paperOverlay,
  ...controls
}: Controls & {
  // A dialog is open over the chrome, which stays at full strength and inert (InertRegion).
  covered: boolean;
  // Button Size, live while its slider is dragged.
  buttonScale: number;
  // The drawer opens while Button Size is dragged, as shipping's does, so every control it
  // resizes is in view.
  resizing: boolean;
  status: ReactNode;
  children: ComponentProps<typeof NativeDrawingLayout>['children'];
  paperOverlay: (drawerOpen: boolean) => ReactNode;
}) {
  const { screen, sound, disabled } = controls;
  const { toolbarStyle } = sound.settings;
  const bare = toolbarStyle === 'bare';
  const [panelGlass, setPanelGlass] = useState<PanelGlass | null>(null);
  // The Actions Panel's button size, which the landscape column centres More colors on.
  const [actionButtonSize, setActionButtonSize] = useState<number | null>(null);
  const [drawerChosen, setDrawerChosen] = useRememberedDrawer();
  const drawerOpen = drawerChosen || resizing;
  const blocked = disabled || covered;
  const slot = useFlyoutSlot(drawerOpen, blocked, screen.drawing);
  const fullscreen = useFullscreen(!blocked);
  const ink = paintAppearance(sound.settings.selectedColor, useDrawingAppearance()).hex;
  const clear = useClearGesture({
    // The button stays live through a stroke and under a dialog, but its activation plays the
    // clear before the command can refuse, so the gesture itself waits.
    disabled: blocked || screen.drawing || screen.commandBusy,
    drawing: screen.history.drawing,
    // The same clear path as every other Clear, so Auto-Save on Delete keeps the picture first.
    onClear: () => screen.clear(sound.settings.saveOnDeleteEnabled),
    sound: sound.owner?.clear ?? null,
  });
  return (
    <ToolbarSkin.Provider value={toolbarStyle}>
      <InertRegion.Provider value={covered}>
        <NativeDrawingLayout
          paper={drawingPaper(screen.history.drawing)}
          empty={!screen.inkVisible}
          departingPaper={clear.sheet ? drawingPaper(clear.sheet.drawing) : null}
          bareGlass={
            bare
              ? {
                  open: slot.flyout,
                  expanded: drawerOpen,
                  panel: panelGlass,
                  fullscreen: fullscreen.supported,
                }
              : null
          }
          palette={(layout) => (
            <RsdPalette
              screen={screen}
              sound={sound}
              layout={layout}
              actionButtonSize={actionButtonSize}
              disabled={disabled}
            />
          )}
          clearUnderlay={(offset, frame, departingFrame) => (
            <RsdClearUnderlay
              control={clear}
              drawing={screen.history.drawing}
              offset={offset}
              frame={frame}
              departingFrame={departingFrame}
            />
          )}
          clearOverlay={<RsdClearOverlay control={clear} disabled={disabled} />}
          actionsPanel={(area, viewport) => (
            <RsdActionsPanel
              {...controls}
              ink={ink}
              area={area}
              viewport={viewport}
              open={drawerOpen}
              buttonScale={buttonScale}
              onToggle={() => setDrawerChosen(!drawerOpen)}
              slot={slot}
              onGlass={bare ? setPanelGlass : undefined}
              onButtonSize={setActionButtonSize}
            />
          )}
          capturePress={slot.capturePress}
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
          overlays={
            <>
              <View pointerEvents="box-none" style={paperLayer.fill}>
                <RsdFullscreenToggle fullscreen={fullscreen} />
              </View>
              {paperOverlay(drawerOpen)}
            </>
          }
        >
          {children}
        </NativeDrawingLayout>
      </InertRegion.Provider>
    </ToolbarSkin.Provider>
  );
}

// The shipping Color Palette's plate: the bar surface with a soft shadow cast onto the paper.
const paletteStyles = css.create({
  // The web style compiler rejects an undefined value at every render, so the declared extent
  // goes on whichever axis the flow crosses through a style of its own.
  columnExtent: (extent: number) => ({ width: extent }),
  rowExtent: (extent: number) => ({ height: extent }),
  plate: (flow: PaletteFlow, column: boolean, endClearance: number) => ({
    boxSizing: 'border-box',
    // Positioned, as shipping's .color-palette is. React Native paints a static child before
    // every positioned sibling, so a static plate would sit under the flat style's rail glass.
    position: 'relative',
    flexGrow: 1,
    paddingTop: column ? flow.endPaddingPx : flow.crossStartPaddingPx,
    paddingBottom: column ? endClearance : flow.crossEndPaddingPx,
    paddingLeft: column ? flow.crossStartPaddingPx : flow.endPaddingPx,
    paddingRight: column ? flow.crossEndPaddingPx : flow.endPaddingPx,
    boxShadow: flow.shadow,
    // A safe-area inset shortens the bar but not the viewport the trim counts from, so the
    // flow can overrun its far padding, and past it the bar's end; shipping clips it there.
    overflow: 'hidden',
  }),
  surface: { backgroundColor: colors.surface },
  // The flat style prints the swatches on the paper: the plate keeps its geometry, not its face.
  bare: { backgroundColor: 'transparent', boxShadow: 'none' },
  flow: (column: boolean, gap: number) => ({
    display: 'flex',
    flexDirection: column ? 'column' : 'row',
    alignItems: 'center',
    gap,
  }),
  // An overrunning flow keeps every swatch whole rather than squeezing More colors over the last.
  group: { flexShrink: 0 },
});

function RsdPalette({
  screen,
  sound,
  layout,
  actionButtonSize,
  disabled,
}: {
  screen: Screen;
  sound: Sound;
  layout: PaletteLayout;
  // Until the Actions Panel reports its size, a button the swatch's own size.
  actionButtonSize: number | null;
  disabled: boolean;
}) {
  const { selectedColor, customColors, toolbarStyle } = sound.settings;
  const face = toolbarStyle === 'bare' ? paletteStyles.bare : paletteStyles.surface;
  const column = layout.axis === 'column';
  const flow = PALETTE_FLOWS[layout.axis];
  const paints = visiblePaints(customColors, selectedColor, layout.slots - 1);
  const endClearance = column
    ? columnEndClearance(actionButtonSize ?? flow.swatchPx, layout.endInset)
    : flow.endPaddingPx;
  const spacing = paletteSpacing(layout.length, layout.axis, paints.length + 1, endClearance);
  return (
    <html.div
      data-testid="rsd-palette-plate"
      style={[
        paletteStyles.plate(flow, column, endClearance),
        column ? paletteStyles.columnExtent(flow.extentPx) : paletteStyles.rowExtent(flow.extentPx),
        face,
        paletteStyles.flow(column, spacing),
      ]}
    >
      <html.div
        role="radiogroup"
        aria-label="Paint colors"
        style={[paletteStyles.flow(column, spacing), paletteStyles.group]}
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
              sound.owner?.settings.setColor(color);
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
