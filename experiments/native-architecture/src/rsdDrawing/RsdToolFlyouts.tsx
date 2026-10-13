import type { Brush } from '../drawing/brushes';
import { STROKE_WIDTHS, type StrokeWidth } from '../drawing/strokeWidth';
import { RsdFlyoutMenu } from './RsdFlyoutMenu';
import { RsdIconButton, type FlyoutScale } from './RsdIconButton';
import type { LayoutAxis } from './edgeLayout';
import { inkKeyline } from './inkKeyline';
import { BRUSH_MENU_OPTIONS } from './brushMenuOptions';
import type { NativeIconName } from './icons.generated';

// The eraser previews are holes at the eraser's true pixel size: the unscaled 60px option less
// its two 2px borders, so the icon's 56-unit viewBox maps one to one.
export const ERASER_PREVIEW_PX = 56;

const SIZE_ICONS = {
  ink: ['size-brush-1', 'size-brush-2', 'size-brush-3', 'size-brush-4', 'size-brush-5'],
  magic: ['size-magic-1', 'size-magic-2', 'size-magic-3', 'size-magic-4', 'size-magic-5'],
  eraser: ['size-eraser-1', 'size-eraser-2', 'size-eraser-3', 'size-eraser-4', 'size-eraser-5'],
} as const satisfies Record<string, readonly NativeIconName[]>;

type Placement = FlyoutScale & { direction: LayoutAxis };

// The pen and crayon entries draw their ink parts in the active paint; the magic and eraser
// entries carry their own colors.
export function RsdBrushMenu({
  brushes,
  selected,
  ink,
  disabled,
  onPick,
  ...placement
}: Placement & {
  brushes: readonly Brush[];
  selected: Brush;
  ink: string;
  disabled: boolean;
  onPick: (brush: Brush) => void;
}) {
  const keyline = inkKeyline(ink);
  return (
    <RsdFlyoutMenu label="Brush Menu" {...placement}>
      {brushes.map((brush) => (
        <RsdIconButton
          key={brush}
          skin="flyout"
          base={placement.base}
          scale={placement.scale}
          icon={BRUSH_MENU_OPTIONS[brush].icon}
          label={BRUSH_MENU_OPTIONS[brush].label}
          ink={ink}
          keyline={keyline}
          selection="radio"
          selected={brush === selected}
          onPress={() => {
            if (!disabled) onPick(brush);
          }}
        />
      ))}
    </RsdFlyoutMenu>
  );
}

// The previews change shape with the tool, not just color: ink strokes for the pen and crayon,
// the brush's rainbow for magic, and dashed holes in the paper, at true size, for the eraser.
export function RsdStrokeWidthMenu({
  brush,
  selected,
  ink,
  disabled,
  onPick,
  ...placement
}: Placement & {
  brush: Brush;
  selected: StrokeWidth;
  ink: string;
  disabled: boolean;
  onPick: (width: StrokeWidth) => void;
}) {
  const erasing = brush === 'eraser';
  const icons = SIZE_ICONS[erasing ? 'eraser' : brush === 'magic' ? 'magic' : 'ink'];
  const keyline = erasing ? undefined : inkKeyline(ink);
  return (
    <RsdFlyoutMenu label="Stroke Width Menu" {...placement}>
      {STROKE_WIDTHS.map((width, index) => (
        <RsdIconButton
          key={width}
          skin="flyout"
          base={placement.base}
          scale={placement.scale}
          pinnedIconPx={erasing ? ERASER_PREVIEW_PX : undefined}
          icon={icons[index]}
          label={`${erasing ? 'Eraser size' : 'Size'} ${index + 1}`}
          ink={ink}
          keyline={keyline}
          selection="radio"
          selected={width === selected}
          onPress={() => {
            if (!disabled) onPick(width);
          }}
        />
      ))}
    </RsdFlyoutMenu>
  );
}
