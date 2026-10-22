import type { ReactNode } from 'react';
import { View, type ViewInstance } from 'react-native';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { ActionPanelLayout } from './edgeLayout';
import type { useFlyoutSlot } from './RsdActionsPanel';
import { RsdDrawerCascade } from './RsdDrawerCascade';
import { drawerToolId } from './drawerToolId';

type Screen = ReturnType<typeof useDrawingScreen>;
type Slot = ReturnType<typeof useFlyoutSlot>;
type Face = Pick<ActionPanelLayout, 'size' | 'padding'> & { dimmed: boolean };
export type DrawerTool = Readonly<{
  key: 'brush' | 'stroke' | 'coloring' | 'camera' | 'ai' | 'undo';
  render: (face: Face) => ReactNode;
}>;
const DRAWER_CASCADE_INDEX = {
  brush: 0,
  stroke: 1,
  coloring: 2,
  camera: 3,
  ai: 4,
  undo: 5,
} as const;

function triggerRef(triggers: Slot['triggers'], key: DrawerTool['key'], screen: Screen) {
  // The save polaroid flies out of the Save screenshot button's tile.
  if (key === 'camera') return screen.cameraTile;
  if (key === 'undo') return screen.undoTile;
  if (key !== 'brush' && key !== 'stroke') return undefined;
  return (node: ViewInstance | null) => {
    triggers.current[key] = node;
  };
}

export function RsdDrawerTools({
  tools,
  layout,
  screen,
  slot,
  opening,
  onEntered,
}: {
  tools: readonly DrawerTool[];
  layout: ActionPanelLayout;
  screen: Screen;
  slot: Slot;
  opening: boolean;
  onEntered: () => void;
}) {
  return tools.map((item, index) => (
    <View
      key={item.key}
      ref={triggerRef(slot.triggers, item.key, screen)}
      testID="rsd-drawer-tool"
      nativeID={drawerToolId(item.key)}
      style={[{ position: 'absolute' }, layout.tools[index]]}
      onStartShouldSetResponderCapture={item.key === slot.flyout ? slot.markInside : undefined}
    >
      <RsdDrawerCascade
        opening={opening}
        index={DRAWER_CASCADE_INDEX[item.key]}
        onEntered={index === tools.length - 1 ? onEntered : undefined}
      >
        {item.render({
          size: layout.size,
          padding: layout.padding,
          dimmed: slot.flyout !== null && item.key !== slot.flyout,
        })}
      </RsdDrawerCascade>
    </View>
  ));
}
