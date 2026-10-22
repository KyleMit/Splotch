import { css, html } from 'react-strict-dom';
import { SvgXml } from '../platform/svg';
import { dimensions } from './tokens.css';
import { useDrawingAppearance, useDrawingTheme } from '../drawing/DrawingAppearance';
import { useNativeIconMarkup } from './iconRegistry';
import { blobXml } from './blob';

export const EXTERNAL_MARK_LABEL = '(opens outside Splotch)';

// ExternalMark.svelte's blob and icon sizes, and the standalone mark's top-up of its host link's
// gap. Exported for native-design-primitives-drift.test.mjs, which reads each from shipping.
const EXTERNAL_MARK_PX = {
  inline: { blob: 16, icon: 9 },
  standalone: { blob: 22, icon: 12 },
} as const;
const EXTERNAL_MARK_STANDALONE_GAP_PX = 2;

const styles = css.create({
  mark: { userSelect: 'none', flexShrink: 0 },
  inline: { marginLeft: dimensions.space1 },
  standalone: { marginLeft: EXTERNAL_MARK_STANDALONE_GAP_PX },
});

// The "leaves the app" cue after an outbound link's label: the external arrow on a paint blob,
// named for assistive technology so the link's name says it leaves Splotch before the parental
// gate asks. `standalone` sits beside an icon-led link in the muted icon ink; `inline` sits in
// running prose on a brand wash and takes the link's own ink.
export function RsdExternalMark(
  props: { variant: 'standalone' } | { variant: 'inline'; ink: string }
) {
  const theme = useDrawingTheme();
  const appearance = useDrawingAppearance();
  const icon = useNativeIconMarkup('external')?.[appearance];
  const size = EXTERNAL_MARK_PX[props.variant];
  const fill = props.variant === 'inline' ? theme.brandWash : theme.externalMarkWash;
  const ink = props.variant === 'inline' ? props.ink : theme.iconMuted;
  const xml = blobXml({
    shape: 'radiusBlob3',
    size: size.blob,
    fill,
    icon: icon ? { markup: icon, size: size.icon, ink } : undefined,
  });
  return (
    <html.span
      role="img"
      aria-label={EXTERNAL_MARK_LABEL}
      style={[styles.mark, styles[props.variant]]}
    >
      <SvgXml xml={xml} width={size.blob} height={size.blob} />
    </html.span>
  );
}
