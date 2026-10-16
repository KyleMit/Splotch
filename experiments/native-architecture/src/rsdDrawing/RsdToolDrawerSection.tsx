import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { css, html } from 'react-strict-dom';
import type { BrushPreferencesState, OptionalBrush } from '../settings/brushPreferences';
import type {
  DrawerControl,
  DrawingControlPreferences,
} from '../settings/drawingControlPreferences';
import {
  DRAWING_TOOLS,
  TOOL_DRAWER_COPY,
  TWO_COLUMN_CHIP_WIDTH_PX,
  isDrawingToolOn,
  type DrawingTool,
  type DrawingToolId,
} from '../settings/toolDrawerSection';
import { PENCIL_ERASER_HELP, PENCIL_ERASER_LABEL } from '../settings/pencilEraser';
import { focusedElementId, focusElementById } from './focusCarry';
import { RsdButton } from './RsdButton';
import { RsdSectionReveal } from './RsdSectionReveal';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdSegmentedPicker } from './RsdSegmentedPicker';
import { RsdSettingCard, RsdSettingSectionBody } from './RsdSettingCard';
import { RsdStatusMessage } from './RsdStatusMessage';
import { RsdToggleRow } from './RsdToggleRow';
import { dimensions } from './tokens.css';

// ControlsSection.svelte's spacing; rsd-native-tool-drawer-settings.test.mjs reads each from it.
export const TOOL_DRAWER_SPACING = { toolsTop: 20, headingBottom: 10, pencilTop: 16 } as const;

const styles = css.create({
  group: { display: 'flex', flexDirection: 'column' },
  heading: { marginBottom: TOOL_DRAWER_SPACING.headingBottom },
  rows: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  after: { marginTop: TOOL_DRAWER_SPACING.pencilTop },
  failure: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
});

type ToolDrawerSettings = DrawingControlPreferences &
  Readonly<{ applePencilSeen: boolean; pencilEraserEnabled: boolean }>;

// The shipping Settings › Tool Drawer section (settings/ControlsSection.svelte): the drawer's own
// switch, then, while it is on, every drawing tool under a Drawing Tools rule — toggle rows, or a
// two-column chip grid once the block is wide enough — and the Apple Pencil opt-out once a Pencil
// has been seen and the Eraser is shown.
export function RsdToolDrawerSection({
  settings,
  brushState,
  busy,
  onToolDrawerChange,
  onBrushAvailabilityChange,
  onUndoButtonChange,
  onStrokeWidthControlChange,
  onPencilEraserChange,
  onRetryBrushSave,
}: {
  settings: ToolDrawerSettings;
  brushState: BrushPreferencesState;
  busy: boolean;
  onToolDrawerChange: (enabled: boolean) => void;
  onBrushAvailabilityChange: (brush: OptionalBrush, enabled: boolean) => void;
  onUndoButtonChange: (enabled: boolean) => void;
  onStrokeWidthControlChange: (enabled: boolean) => void;
  onPencilEraserChange: (enabled: boolean) => void;
  onRetryBrushSave: () => void;
}) {
  const brushesBusy = busy || brushState.status !== 'ready';
  const controlSetters: Record<DrawerControl, (enabled: boolean) => void> = {
    undoButtonEnabled: onUndoButtonChange,
    strokeWidthControlEnabled: onStrokeWidthControlChange,
  };
  const pencilShown =
    settings.applePencilSeen && settings.toolDrawerEnabled && brushState.availability.eraser;
  return (
    <RsdSettingSectionBody>
      <html.section data-testid="setting-group" style={styles.group}>
        <RsdSettingCard>
          <RsdToggleRow
            icon="dashboard-customize"
            label={TOOL_DRAWER_COPY.enable}
            id="toolDrawerToggle"
            checked={settings.toolDrawerEnabled}
            disabled={busy}
            help={TOOL_DRAWER_COPY.enableHelp}
            onToggle={onToolDrawerChange}
          />
        </RsdSettingCard>
        <RsdSectionReveal visible={settings.toolDrawerEnabled}>
          <DrawingToolList
            isOn={(tool) => isDrawingToolOn(tool, settings, brushState.availability)}
            isBusy={(tool) => ('brush' in tool ? brushesBusy : busy)}
            onChange={(tool, next) => {
              if ('brush' in tool) onBrushAvailabilityChange(tool.brush, next);
              else controlSetters[tool.control](next);
            }}
          />
        </RsdSectionReveal>
        {brushState.message ? (
          <html.div style={[styles.after, styles.failure]}>
            <RsdStatusMessage status="error">{brushState.message}</RsdStatusMessage>
            {brushState.saved ? null : (
              <RsdButton size="sm" onPress={onRetryBrushSave}>
                Retry saving brush choices
              </RsdButton>
            )}
          </html.div>
        ) : null}
        <RsdSectionReveal visible={pencilShown} marginTop={TOOL_DRAWER_SPACING.pencilTop}>
          <RsdSettingCard>
            <RsdToggleRow
              icon="brush-eraser"
              label={PENCIL_ERASER_LABEL}
              id="pencilEraserToggle"
              checked={settings.pencilEraserEnabled}
              disabled={busy}
              help={PENCIL_ERASER_HELP}
              onToggle={onPencilEraserChange}
            />
          </RsdSettingCard>
        </RsdSectionReveal>
      </html.section>
    </RsdSettingSectionBody>
  );
}

function focusedTool(): DrawingToolId | null {
  const id = focusedElementId();
  return DRAWING_TOOLS.find((tool) => tool.id === id)?.id ?? null;
}

// The Drawing Tools block in the skin its own width earns: toggle rows on a narrow page, the
// two-column chip grid from TWO_COLUMN_CHIP_WIDTH_PX up.
function DrawingToolList({
  isOn,
  isBusy,
  onChange,
}: {
  isOn: (tool: DrawingTool) => boolean;
  isBusy: (tool: DrawingTool) => boolean;
  onChange: (tool: DrawingTool, next: boolean) => void;
}) {
  const [blockWidth, setBlockWidth] = useState(0);
  const chips = blockWidth >= TWO_COLUMN_CHIP_WIDTH_PX;
  // A skin change unmounts the control a keyboard user was on; the tool's id names the same tool
  // under either skin, so it carries focus across the swap, as shipping's ControlsSection does.
  const refocus = useRef<DrawingToolId | null>(null);
  const measure = (width: number) => {
    if (width >= TWO_COLUMN_CHIP_WIDTH_PX !== chips) refocus.current = focusedTool();
    setBlockWidth(width);
  };
  useEffect(() => {
    const id = refocus.current;
    refocus.current = null;
    if (id) focusElementById(id);
  }, [chips]);
  const toggle = (id: DrawingToolId) => {
    const tool = DRAWING_TOOLS.find((entry) => entry.id === id);
    if (tool) onChange(tool, !isOn(tool));
  };
  return (
    <View
      testID="tool-drawer-tools"
      style={{ marginTop: TOOL_DRAWER_SPACING.toolsTop }}
      onLayout={({ nativeEvent }) => measure(nativeEvent.layout.width)}
    >
      <html.div style={styles.heading}>
        <RsdRuleLabel as="h4" strong>
          {TOOL_DRAWER_COPY.tools}
        </RsdRuleLabel>
      </html.div>
      {chips ? (
        <RsdSegmentedPicker
          variant="chip"
          mode="toggle"
          label={TOOL_DRAWER_COPY.tools}
          options={DRAWING_TOOLS.map((tool) => ({
            value: tool.id,
            id: tool.id,
            label: tool.label,
            icon: tool.icon,
            disabled: isBusy(tool),
          }))}
          selected={DRAWING_TOOLS.filter(isOn).map((tool) => tool.id)}
          onSelect={toggle}
        />
      ) : (
        <html.div style={styles.rows}>
          {DRAWING_TOOLS.map((tool) => (
            <RsdSettingCard key={tool.id}>
              <RsdToggleRow
                icon={tool.icon}
                label={tool.label}
                id={tool.id}
                checked={isOn(tool)}
                disabled={isBusy(tool)}
                onToggle={(next) => onChange(tool, next)}
              />
            </RsdSettingCard>
          ))}
        </html.div>
      )}
    </View>
  );
}
