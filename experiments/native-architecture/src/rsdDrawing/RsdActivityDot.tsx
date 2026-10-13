import { css, html } from 'react-strict-dom';
import { brandColors, colors, motion } from './tokens.css';

// The shipping `.section-activity-dot` (HubList.svelte, SidebarToc.svelte): an 8px brand dot
// over the icon's top-right corner, ringed in the surface it sits on so it cuts the icon cleanly.
// rsd-native-settings-rows.test.mjs reads these from those sources.
const DOT_PX = 8;
const DOT_OFFSET_PX = 3;
const DOT_RING_PX = 2;
const RING_BOX_PX = DOT_PX + 2 * DOT_RING_PX;

const styles = css.create({
  dot: {
    boxSizing: 'border-box',
    position: 'absolute',
    top: -(DOT_OFFSET_PX + DOT_RING_PX),
    right: -(DOT_OFFSET_PX + DOT_RING_PX),
    width: RING_BOX_PX,
    height: RING_BOX_PX,
    borderRadius: RING_BOX_PX / 2,
    borderWidth: DOT_RING_PX,
    borderStyle: 'solid',
    backgroundColor: brandColors.brand,
    pointerEvents: 'none',
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: motion.easeGlide,
  },
  // A new item's dot is there the moment the row is; only a seen one fades out.
  unseen: { opacity: 1, transitionDuration: '0s' },
  onSurface: { borderColor: colors.surface },
  onSurface2: { borderColor: colors.surface2 },
});

export function RsdActivityDot({
  unseen,
  surface,
}: {
  unseen: boolean;
  surface: 'surface' | 'surface2';
}) {
  return (
    <html.div
      aria-hidden
      data-testid="section-activity-dot"
      style={[
        styles.dot,
        surface === 'surface' ? styles.onSurface : styles.onSurface2,
        unseen && styles.unseen,
      ]}
    />
  );
}
