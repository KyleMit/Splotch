import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { css, html } from 'react-strict-dom';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { paintAppearance, visiblePaints } from '../drawing/palette';
import { RsdIconButton } from './RsdIconButton';
import { RsdMoreColorsSwatch, RsdPaintAction } from './RsdSwatch';
import { PALETTE_FLOWS, paletteSpacing, type PaletteFlow } from './paletteGeometry';
import { colors } from './tokens.css';
import { useClearGesture } from '../clear/useClearGesture';
import { RsdClearOverlay } from './RsdClearControl';
import { RsdClearUnderlay } from './clearSurfaces';
import { NativeDrawingLayout, type PaletteLayout } from './NativeScrollAreas';
import { RsdActionsPanel, useFlyoutSlot } from './RsdActionsPanel';
import { RsdFullscreenToggle } from './RsdFullscreenToggle';
import { useFullscreen } from '../platform/useFullscreen';
import { ToolbarSkin } from './toolbarSkin';
import type { PanelGlass } from './bareGlassLayout';

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

// The paper arrives as prebuilt children, so a drawer toggle re-renders only this layout
// and the overlay that reads the drawer state, never the strokes on the paper.
export function RsdEdgeLayout({
  paintsDisabled,
  buttonScale,
  resizing,
  status,
  children,
  paperOverlay,
  ...controls
}: Controls & {
  paintsDisabled: boolean;
  // Button Size, live while its slider is dragged.
  buttonScale: number;
  // The drawer opens while Button Size is dragged, as shipping's does, so every control it
  // resizes is in view.
  resizing: boolean;
  status: ReactNode;
  children: ReactNode;
  paperOverlay: (drawerOpen: boolean) => ReactNode;
}) {
  const { screen, sound, disabled } = controls;
  const { toolbarStyle } = sound.settings;
  const bare = toolbarStyle === 'bare';
  const [panelGlass, setPanelGlass] = useState<PanelGlass | null>(null);
  const [drawerChosen, setDrawerChosen] = useState(false);
  const drawerOpen = drawerChosen || resizing;
  const slot = useFlyoutSlot(drawerOpen, disabled);
  const fullscreen = useFullscreen(!disabled);
  const ink = paintAppearance(sound.settings.selectedColor, useDrawingAppearance()).hex;
  const clear = useClearGesture({
    disabled,
    drawing: screen.history.drawing,
    // The same clear path as every other Clear, so Auto-Save on Delete keeps the picture first.
    onClear: () => screen.clear(sound.settings.saveOnDeleteEnabled),
    sound: sound.owner?.clear ?? null,
  });
  return (
    <ToolbarSkin.Provider value={toolbarStyle}>
      <NativeDrawingLayout
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
          <RsdPalette screen={screen} sound={sound} layout={layout} disabled={paintsDisabled} />
        )}
        clearUnderlay={(offset) => (
          <RsdClearUnderlay control={clear} drawing={screen.history.drawing} offset={offset} />
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
    </ToolbarSkin.Provider>
  );
}

// The shipping Color Palette's plate: the bar surface with a soft shadow cast onto the paper.
const paletteStyles = css.create({
  // The web style compiler rejects an undefined value at every render, so the declared extent
  // goes on whichever axis the flow crosses through a style of its own.
  columnExtent: (extent: number) => ({ width: extent }),
  rowExtent: (extent: number) => ({ height: extent }),
  // The landscape column's surface continues under the bottom inset, where no swatch may sit.
  insetStrip: (height: number, shadow: string) => ({ flexShrink: 0, height, boxShadow: shadow }),
  plate: (flow: PaletteFlow, column: boolean) => ({
    boxSizing: 'border-box',
    flexGrow: 1,
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
  // The flat style prints the swatches on the paper: the plate keeps its geometry, not its face.
  bare: { backgroundColor: 'transparent', boxShadow: 'none' },
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
  const { selectedColor, customColors, toolbarStyle } = sound.settings;
  const face = toolbarStyle === 'bare' ? paletteStyles.bare : paletteStyles.surface;
  const column = layout.axis === 'column';
  const flow = PALETTE_FLOWS[layout.axis];
  const paints = visiblePaints(customColors, selectedColor, layout.slots - 1);
  const spacing = paletteSpacing(layout.length - layout.endInset, layout.axis, paints.length + 1);
  return (
    <>
      <html.div
        data-testid="rsd-palette-plate"
        style={[
          paletteStyles.plate(flow, column),
          column
            ? paletteStyles.columnExtent(flow.extentPx)
            : paletteStyles.rowExtent(flow.extentPx),
          face,
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
      {layout.endInset > 0 ? (
        <html.div
          aria-hidden
          style={[
            paletteStyles.columnExtent(flow.extentPx),
            paletteStyles.insetStrip(layout.endInset, flow.shadow),
            face,
          ]}
        />
      ) : null}
    </>
  );
}
