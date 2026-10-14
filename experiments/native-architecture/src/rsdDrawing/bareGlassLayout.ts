import { useLayoutEffect } from 'react';
import type { OpenFlyout } from './RsdActionsPanel';
import type { ActionPanelLayout, ActionPanelMode } from './edgeLayout';
import { flyoutOptionSize } from './RsdIconButton';

// What the flat style's glass reads from the Actions Panel: how many tiles it lays out and how big,
// how big a menu option is, and which of the Brush and Stroke Width buttons it shows. The panel
// reports it up, since the glass lies under the clear wash, a layer below the panel's own.
export type PanelGlass = Readonly<{
  mode: ActionPanelMode;
  count: number;
  size: number;
  optionSize: number;
  // The Brush Menu's entries, or 1 with no Brush Button, as shipping counts its optional brushes
  // plus the pen.
  brushOptions: number;
  stroke: boolean;
}>;

export type BareGlass = Readonly<{
  open: OpenFlyout;
  expanded: boolean;
  panel: PanelGlass | null;
}>;

function samePanel(previous: PanelGlass | null, next: PanelGlass) {
  return (
    previous !== null &&
    previous.mode === next.mode &&
    previous.count === next.count &&
    previous.size === next.size &&
    previous.optionSize === next.optionSize &&
    previous.brushOptions === next.brushOptions &&
    previous.stroke === next.stroke
  );
}

export type ReportPanelGlass = (update: (previous: PanelGlass | null) => PanelGlass | null) => void;

export function useReportPanelGlass(
  report: ReportPanelGlass | undefined,
  layout: ActionPanelLayout,
  scale: number,
  tools: readonly { key: string }[],
  // The Brush Menu's entries, the pen among them.
  brushes: number
) {
  const { mode, size } = layout;
  const count = tools.length;
  const optionSize = flyoutOptionSize({ base: layout.base, scale });
  const brushOptions = tools.some((tool) => tool.key === 'brush') ? brushes : 1;
  const stroke = tools.some((tool) => tool.key === 'stroke');
  useLayoutEffect(() => {
    if (!report) return;
    const next = { mode, count, size, optionSize, brushOptions, stroke };
    report((previous) => (samePanel(previous, next) ? previous : next));
  }, [report, mode, count, size, optionSize, brushOptions, stroke]);
}
