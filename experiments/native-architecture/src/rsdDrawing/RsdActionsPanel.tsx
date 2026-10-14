import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { refocusFlyoutTrigger, useFlyoutEscape } from '../platform/flyoutFocus';
import { RsdIconButton } from './RsdIconButton';
import { useReportPanelGlass, type ReportPanelGlass } from './bareGlassLayout';
import { BRUSH_MENU_OPTIONS } from './brushMenuOptions';
import { RsdBrushMenu, RsdColorMenu, RsdStrokeWidthMenu } from './toolFlyouts';
import { RsdColorButton } from './RsdColorButton';
import { inkKeyline } from './inkKeyline';
import { aiButtonFace } from '../ai/uiState';
import {
  actionPanelLayout,
  DRAWER_CHEVRON_TURN_DEG,
  flyoutPlacement,
  isPhoneLandscapeViewport,
  type ActionPanelLayout,
  type AreaSize,
} from './edgeLayout';
import type { NativeIconName } from './icons.generated';
import { drawerControlShown } from '../settings/drawingControlPreferences';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;
type Product = ReturnType<typeof useDrawingProduct>;
type FlyoutName = 'brush' | 'stroke' | 'color';
export type OpenFlyout = FlyoutName | null;

const PERCENT = 100;

// An open menu stacks over the drawer's tiles.
const FLYOUT_Z_INDEX = 1;

const docks = StyleSheet.create({
  slot: { position: 'absolute' },
  flyout: { position: 'absolute', zIndex: FLYOUT_Z_INDEX },
});

// Shipping closes an open menu on any press outside it, without swallowing that press: a stroke
// on the paper still draws. The layout's root asks first and the menu's own boxes answer later
// in the same capture pass, so the close waits until the pass has run. Escape and a pick close it
// through `close`, which hands keyboard focus back to the menu's button, as shipping's
// closeFlyout({ restoreFocus: true }) does. A menu opens only between strokes; closing never waits.
export function useFlyoutSlot(open: boolean, disabled: boolean, drawing: boolean) {
  const [flyout, setOpenFlyout] = useState<OpenFlyout>(null);
  const inside = useRef(false);
  // The landscape phone's Color Menu opens beside its own button, drawer open or not, and leaving
  // that layout closes it, as shipping's panel does. The slot outlives every panel that renders
  // the button, so a rotation back never finds the menu still open.
  const colorButton = isPhoneLandscapeViewport(useWindowDimensions());
  const staleColor = flyout === 'color' && !colorButton;
  useEffect(() => {
    if (staleColor) setOpenFlyout(null);
  }, [staleColor]);
  const shown = !disabled && !staleColor && (open || flyout === 'color') ? flyout : null;
  const live = useRef(shown);
  live.current = shown;
  const menu = useRef<View>(null);
  const triggers = useRef<Partial<Record<FlyoutName, View | null>>>({});
  function close() {
    const current = live.current;
    if (current) refocusFlyoutTrigger(menu.current, triggers.current[current]);
    setOpenFlyout(null);
  }
  useFlyoutEscape(shown !== null, close);
  return {
    flyout: shown,
    setFlyout(next: OpenFlyout) {
      if (next === null || !drawing) setOpenFlyout(next);
    },
    close,
    menu,
    triggers,
    capturePress() {
      inside.current = false;
      if (live.current)
        queueMicrotask(() => {
          if (!inside.current) setOpenFlyout(null);
        });
      return false;
    },
    markInside() {
      inside.current = true;
      return false;
    },
  };
}

type Tool = Readonly<{ key: 'brush' | 'stroke' | 'coloring' | 'camera' | 'ai' | 'undo' }> & {
  render: (face: Face) => ReactNode;
};
// A tile's size and padding, and whether an open menu greys it out.
type Face = Pick<ActionPanelLayout, 'size' | 'padding'> & { dimmed: boolean };

// The Brush and Stroke Width slots are where a closing menu hands keyboard focus back.
function triggerRef(
  triggers: ReturnType<typeof useFlyoutSlot>['triggers'],
  key: Tool['key'],
  screen: Screen
) {
  // The save polaroid flies out of the Save screenshot button's tile.
  if (key === 'camera') return screen.cameraTile;
  if (key !== 'brush' && key !== 'stroke') return undefined;
  return (node: View | null) => {
    triggers.current[key] = node;
  };
}

function strokeIcon(brush: Screen['brush']): NativeIconName {
  if (brush === 'eraser') return 'line-weight-eraser';
  return brush === 'magic' ? 'line-weight-magic' : 'line-weight-brush';
}

type ToolContext = {
  screen: Screen;
  sound: Sound;
  product: Product;
  disabled: boolean;
  ink: string;
  flyout: OpenFlyout;
  setFlyout: (next: OpenFlyout) => void;
};

// The Brush Button: a menu of every shown brush, or with one optional brush a switch for it.
function brushTool({ screen, sound, disabled, ink, flyout, setFlyout }: ToolContext): Tool | null {
  const keyline = inkKeyline(ink);
  // The Tool Drawer switch hides every optional brush, and with them the Brush Button.
  const control: Screen['brushControl'] = sound.settings.toolDrawerEnabled
    ? screen.brushControl
    : { kind: 'none' };
  if (control.kind === 'toggle')
    return {
      key: 'brush',
      render: (face) => (
        <RsdIconButton
          skin="tile"
          {...face}
          icon={BRUSH_MENU_OPTIONS[control.brush].icon}
          label={BRUSH_MENU_OPTIONS[control.brush].label}
          ink={ink}
          keyline={keyline}
          selection="switch"
          selected={screen.brush === control.brush}
          disabled={disabled}
          onPress={screen.toggleBrush}
        />
      ),
    };
  if (control.kind === 'none') return null;
  return {
    key: 'brush',
    render: (face) => (
      <RsdIconButton
        skin="tile"
        {...face}
        icon={BRUSH_MENU_OPTIONS[screen.brush].icon}
        label="Brushes"
        ink={ink}
        keyline={keyline}
        expanded={flyout === 'brush'}
        disabled={disabled}
        onPress={() => setFlyout(flyout === 'brush' ? null : 'brush')}
      />
    ),
  };
}

// The Stroke Width Button wears the held brush's line glyph in the active ink; the eraser's needs
// no keyline, since it carries its own colors.
function strokeTool({ screen, sound, disabled, ink, flyout, setFlyout }: ToolContext): Tool {
  return {
    key: 'stroke',
    render: (face) => (
      <RsdIconButton
        skin="tile"
        {...face}
        icon={strokeIcon(screen.brush)}
        label="Stroke width"
        ink={ink}
        keyline={screen.brush === 'eraser' ? undefined : inkKeyline(ink)}
        expanded={flyout === 'stroke'}
        disabled={disabled || sound.settings.status !== 'ready'}
        onPress={() => setFlyout(flyout === 'stroke' ? null : 'stroke')}
      />
    ),
  };
}

// The shipping Actions Panel, in its order: Brush, Stroke Width, Coloring Book, Screenshot, AI
// Image and Undo, each switched off where Settings hides it. The Tool Drawer switch hides the
// drawer's own tools; Coloring, the camera and AI belong to their own sections and stay.
function panelTools(context: ToolContext): Tool[] {
  const { screen, sound, product, disabled } = context;
  const brush = brushTool(context);
  const tools: Tool[] = brush ? [brush] : [];
  if (drawerControlShown(sound.settings, 'strokeWidthControlEnabled'))
    tools.push(strokeTool(context));
  if (sound.settings.coloringBookEnabled)
    tools.push({
      key: 'coloring',
      render: (face) => (
        <RsdIconButton
          skin="tile"
          {...face}
          icon="shapes"
          label="Coloring books"
          disabled={disabled}
          onPress={() => screen.setPagePickerOpen(true)}
        />
      ),
    });
  if (sound.settings.screenshotEnabled)
    tools.push({
      key: 'camera',
      render: (face) => (
        <RsdIconButton
          skin="tile"
          {...face}
          icon="camera"
          label="Save screenshot"
          disabled={disabled || !screen.inkVisible}
          onPress={() => {
            void screen.save();
          }}
        />
      ),
    });
  if (sound.settings.aiEnabled) {
    const ai = aiButtonFace(product.ai.state, !screen.inkVisible);
    tools.push({
      key: 'ai',
      render: (face) => (
        <RsdIconButton
          skin="tile"
          {...face}
          icon="wand-stars"
          label={ai.label}
          disabled={disabled || ai.disabled}
          busy={ai.busy}
          badge={ai.badge}
          onPress={() => {
            if (screen.drawing) return;
            product.ai.owner?.start({
              onSetup: screen.openAiSettings,
              customize: sound.settings.aiCustomizationEnabled,
            });
          }}
        />
      ),
    });
  }
  if (drawerControlShown(sound.settings, 'undoButtonEnabled'))
    tools.push({
      key: 'undo',
      render: (face) => (
        <RsdIconButton
          skin="tile"
          {...face}
          icon="undo"
          label="Undo"
          disabled={disabled || screen.history.undo.length === 0}
          onPress={screen.undo}
        />
      ),
    });
  return tools;
}

type ActionsPanelProps = {
  screen: Screen;
  sound: Sound;
  product: Product;
  disabled: boolean;
  ink: string;
  area: AreaSize;
  viewport: AreaSize;
  open: boolean;
  // Button Size, live while its slider is dragged.
  buttonScale: number;
  onToggle: () => void;
  slot: ReturnType<typeof useFlyoutSlot>;
  // The flat style's glass follows the panel's tiles; the raised style has none.
  onGlass: ReportPanelGlass | undefined;
};

// The drawer of drawing tools in the paper area's bottom-left corner, with its chevron after the
// tools, and the Brush and Stroke Width menus that pop beside their buttons.
export function RsdActionsPanel({
  screen,
  sound,
  product,
  disabled,
  ink,
  area,
  viewport,
  open,
  buttonScale,
  onToggle,
  slot,
  onGlass,
}: ActionsPanelProps) {
  const { flyout, setFlyout, markInside, close, menu: menuSlot, triggers } = slot;
  const insets = useSafeAreaInsets();
  const tools = panelTools({ screen, sound, product, disabled, ink, flyout, setFlyout });
  // Shipping's data-no-actions: with no control left to show, the chevron goes too, while a
  // landscape phone keeps its Color Button, which no Settings section owns.
  const noActions = tools.length === 0;
  const scale = buttonScale / PERCENT;
  const layout = actionPanelLayout({
    area,
    viewport,
    scale,
    count: tools.length,
    leg: tools.filter((tool) => tool.key === 'brush' || tool.key === 'stroke').length,
    open,
    bottomInset: insets.bottom,
  });
  useReportPanelGlass(onGlass, layout, scale, tools, screen.availableBrushes.length);
  const trigger = tools.findIndex((tool) => tool.key === flyout);
  const placement =
    trigger < 0 ? null : flyoutPlacement(layout.mode, layout.tools[trigger], layout.size, viewport);
  const menu = placement ? { base: layout.base, scale, direction: placement.direction } : null;
  const tool = flyout === 'stroke' && screen.brush === 'eraser' ? 'eraser' : 'drawing';
  if (noActions && !layout.color) return null;
  return (
    <>
      <RsdColorControl
        screen={screen}
        sound={sound}
        disabled={disabled}
        ink={ink}
        area={area}
        viewport={viewport}
        layout={layout}
        scale={scale}
        open={open}
        slot={slot}
        onToggle={onToggle}
      />
      {open
        ? tools.map((item, index) => (
            <View
              key={item.key}
              ref={triggerRef(triggers, item.key, screen)}
              testID="rsd-drawer-tool"
              style={[docks.slot, layout.tools[index]]}
              onStartShouldSetResponderCapture={item.key === flyout ? markInside : undefined}
            >
              {item.render({
                size: layout.size,
                padding: layout.padding,
                dimmed: flyout !== null && item.key !== flyout,
              })}
            </View>
          ))
        : null}
      {placement && menu ? (
        <View
          ref={menuSlot}
          testID="rsd-tool-flyout"
          style={[docks.flyout, { left: placement.left, bottom: placement.bottom }]}
          onStartShouldSetResponderCapture={markInside}
        >
          {flyout === 'brush' ? (
            <RsdBrushMenu
              {...menu}
              brushes={screen.availableBrushes}
              selected={screen.brush}
              ink={ink}
              disabled={disabled}
              onPick={(brush) => {
                screen.setBrush(brush);
                close();
              }}
            />
          ) : (
            <RsdStrokeWidthMenu
              {...menu}
              brush={screen.brush}
              selected={tool === 'eraser' ? sound.settings.eraserWidth : sound.settings.strokeWidth}
              ink={ink}
              disabled={disabled || sound.settings.status !== 'ready'}
              onPick={(width) => {
                void sound.owner?.settings.setWidth(tool, width);
                close();
              }}
            />
          )}
        </View>
      ) : null}
      {noActions ? null : (
        <DrawerChevron
          layout={layout}
          open={open}
          dimmed={flyout !== null}
          onPress={() => {
            setFlyout(null);
            onToggle();
          }}
        />
      )}
    </>
  );
}

// The muted corner chevron that opens and closes the drawer, turned toward where it will move.
function DrawerChevron({
  layout,
  open,
  dimmed,
  onPress,
}: {
  layout: ActionPanelLayout;
  open: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  return (
    <View testID="rsd-drawer-dock" style={[docks.slot, layout.toggle]}>
      <RsdIconButton
        skin="corner"
        icon="chevron-right"
        label={open ? 'Collapse controls' : 'Expand controls'}
        expanded={open}
        dimmed={dimmed}
        turn={DRAWER_CHEVRON_TURN_DEG[layout.mode][open ? 'open' : 'closed']}
        onPress={onPress}
      />
    </View>
  );
}

// The landscape phone's Color Button and the Color Menu it opens, which take the palette bar's place
// there. The flyout slot closes the menu when the layout goes.
function RsdColorControl({
  screen,
  sound,
  disabled,
  ink,
  area,
  viewport,
  layout,
  scale,
  open,
  slot,
  onToggle,
}: {
  screen: Screen;
  sound: Sound;
  disabled: boolean;
  ink: string;
  area: AreaSize;
  viewport: AreaSize;
  layout: ActionPanelLayout;
  scale: number;
  open: boolean;
  slot: ReturnType<typeof useFlyoutSlot>;
  onToggle: () => void;
}) {
  const { flyout, setFlyout, markInside, close, menu, triggers } = slot;
  const place = layout.color;
  if (!place) return null;
  const paintsDisabled = disabled || sound.settings.status !== 'ready';
  const expanded = flyout === 'color';
  const placement = expanded ? flyoutPlacement(layout.mode, place, layout.size, viewport) : null;
  return (
    <>
      <RsdColorButton
        place={place}
        size={layout.size}
        ink={ink}
        expanded={expanded}
        dimmed={flyout !== null && !expanded}
        disabled={paintsDisabled}
        drawerOpen={open}
        foldable={layout.tools.length > 0}
        slotRef={(node) => {
          triggers.current.color = node;
        }}
        onCapture={expanded ? markInside : undefined}
        onToggle={() => setFlyout(expanded ? null : 'color')}
        onFold={() => {
          setFlyout(null);
          onToggle();
        }}
      />
      {placement ? (
        <View
          ref={menu}
          testID="rsd-tool-flyout"
          style={[docks.flyout, { left: placement.left, bottom: placement.bottom }]}
          onStartShouldSetResponderCapture={markInside}
        >
          <RsdColorMenu
            base={layout.base}
            scale={scale}
            areaWidth={area.width}
            buttonSize={layout.size}
            selected={sound.settings.selectedColor}
            erasing={screen.brush === 'eraser'}
            disabled={paintsDisabled}
            onPick={(color) => {
              screen.selectInkBrush();
              void sound.owner?.settings.setColor(color);
              close();
            }}
            onCustom={() => {
              screen.selectInkBrush();
              close();
              screen.openColorPicker();
            }}
          />
        </View>
      ) : null}
    </>
  );
}
