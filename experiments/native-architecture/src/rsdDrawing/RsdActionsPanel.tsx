import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { refocusFlyoutTrigger, useFlyoutEscape } from '../platform/flyoutFocus';
import { RsdIconButton } from './RsdIconButton';
import { BRUSH_MENU_OPTIONS } from './brushMenuOptions';
import { RsdBrushMenu, RsdStrokeWidthMenu } from './toolFlyouts';
import { inkKeyline } from './inkKeyline';
import {
  actionPanelLayout,
  DRAWER_CHEVRON_TURN_DEG,
  flyoutPlacement,
  type ActionPanelLayout,
  type AreaSize,
} from './edgeLayout';
import type { NativeIconName } from './icons.generated';
import { drawerControlShown } from '../settings/drawingControlPreferences';

type Screen = ReturnType<typeof useDrawingScreen>;
type Sound = ReturnType<typeof useDrawingSound>;
type Product = ReturnType<typeof useDrawingProduct>;
type FlyoutName = 'brush' | 'stroke';
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
// closeFlyout({ restoreFocus: true }) does.
export function useFlyoutSlot(open: boolean, disabled: boolean) {
  const [flyout, setFlyout] = useState<OpenFlyout>(null);
  const inside = useRef(false);
  const shown = open && !disabled ? flyout : null;
  const live = useRef(shown);
  live.current = shown;
  const menu = useRef<View>(null);
  const triggers = useRef<Partial<Record<FlyoutName, View | null>>>({});
  function close() {
    const current = live.current;
    if (current) refocusFlyoutTrigger(menu.current, triggers.current[current]);
    setFlyout(null);
  }
  useFlyoutEscape(shown !== null, close);
  return {
    flyout: shown,
    setFlyout,
    close,
    menu,
    triggers,
    capturePress() {
      inside.current = false;
      if (live.current)
        queueMicrotask(() => {
          if (!inside.current) setFlyout(null);
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
function triggerRef(triggers: ReturnType<typeof useFlyoutSlot>['triggers'], key: Tool['key']) {
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
  if (sound.settings.aiEnabled)
    tools.push({
      key: 'ai',
      render: (face) => (
        <RsdIconButton
          skin="tile"
          {...face}
          icon="wand-stars"
          label="AI picture"
          disabled={disabled}
          onPress={() => product.ai.owner?.open()}
        />
      ),
    });
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
}: {
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
}) {
  const { flyout, setFlyout, markInside, close, menu: menuSlot, triggers } = slot;
  const tools = panelTools({ screen, sound, product, disabled, ink, flyout, setFlyout });
  // Shipping's data-no-actions: with no control left to show, the chevron goes too.
  if (tools.length === 0) return null;
  const scale = buttonScale / PERCENT;
  const layout = actionPanelLayout({
    area,
    viewport,
    scale,
    count: tools.length,
    leg: tools.filter((tool) => tool.key === 'brush' || tool.key === 'stroke').length,
    open,
  });
  const trigger = tools.findIndex((tool) => tool.key === flyout);
  const placement =
    trigger < 0 ? null : flyoutPlacement(layout.mode, layout.tools[trigger], layout.size, viewport);
  const menu = placement ? { base: layout.base, scale, direction: placement.direction } : null;
  const tool = flyout === 'stroke' && screen.brush === 'eraser' ? 'eraser' : 'drawing';
  return (
    <>
      {open
        ? tools.map((item, index) => (
            <View
              key={item.key}
              ref={triggerRef(triggers, item.key)}
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
      <View testID="rsd-drawer-dock" style={[docks.slot, layout.toggle]}>
        <RsdIconButton
          skin="corner"
          icon="chevron-right"
          label={open ? 'Collapse controls' : 'Expand controls'}
          expanded={open}
          dimmed={flyout !== null}
          turn={DRAWER_CHEVRON_TURN_DEG[layout.mode][open ? 'open' : 'closed']}
          onPress={() => {
            setFlyout(null);
            onToggle();
          }}
        />
      </View>
    </>
  );
}
