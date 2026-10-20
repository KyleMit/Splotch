import { useState } from 'react';
import { Platform } from 'react-native';
import { css, html } from 'react-strict-dom';
import { Svg, Path } from '../platform/svg';
import type { SECTIONS } from '../../../../web/src/routes/privacy/contents';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { PRIVACY_LAYOUT } from '../information/privacyLayout';
import { RsdPressable } from './RsdPressable';
import { RsdPageAnchor } from './RsdPageAnchor';
import { RsdIcon } from './RsdIcon';
import { blobPath } from './blob';
import { focusRingHost } from './focusRing';
import { styles as controls } from './controls';
import { colors, dimensions } from './tokens.css';

// Local for StyleX's static evaluation; rsd-native-privacy-navigation.test.mjs pins shipping geometry.
export const PRIVACY_LINK_GEOMETRY = { target: 44, blob: 30, icon: 16, headingGap: 6 } as const;
const LINK_TARGET_PX = PRIVACY_LINK_GEOMETRY.target;
const LINK_ICON_PX = PRIVACY_LINK_GEOMETRY.icon;
const LINK_BLOB_PX = PRIVACY_LINK_GEOMETRY.blob;
const HEADING_GAP_PX = PRIVACY_LINK_GEOMETRY.headingGap;
const styles = css.create({
  header: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
    marginBottom: HEADING_GAP_PX,
  },
  wide: (gap: number) => ({ gap }),
  title: { margin: 0, color: colors.textStrong, fontSize: dimensions.fontSizeLg, flexShrink: 1 },
  anchor: {
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: LINK_TARGET_PX,
    height: LINK_TARGET_PX,
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: colors.brandText,
    cursor: 'pointer',
    opacity: { default: 1, '@media (hover: hover)': { default: 0, ':focus-visible': 1 } },
  },
  margin: (marginLeft: number) => ({ marginLeft }),
  revealed: { opacity: 1 },
  mark: { position: 'absolute', width: LINK_BLOB_PX, height: LINK_BLOB_PX },
  glyph: { position: 'relative', zIndex: 1 },
  text: { color: colors.brandText, fontSize: dimensions.fontSizeMd },
});
const LINK_PATH = blobPath('radiusBlob2', LINK_BLOB_PX, LINK_BLOB_PX);

export function RsdPrivacyHeading({
  section,
  copied,
  wide,
  onCopy,
}: {
  section: (typeof SECTIONS)[number];
  copied: boolean;
  wide: boolean;
  onCopy: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const theme = useDrawingTheme();
  const name = `Copy link to “${section.label}”`;
  const style = [
    styles.anchor,
    wide && styles.margin(-PRIVACY_LAYOUT.railGap),
    (hovered || copied) && styles.revealed,
  ];
  const face = (
    <>
      <html.div aria-hidden style={styles.mark}>
        <Svg width={LINK_BLOB_PX} height={LINK_BLOB_PX}>
          <Path d={LINK_PATH} fill={copied ? theme.successWash : theme.brandWash} />
        </Svg>
      </html.div>
      <html.div style={styles.glyph}>
        {copied ? (
          <RsdIcon name="check" size={LINK_ICON_PX} ink={theme.successText} muted={false} />
        ) : (
          <html.span style={[controls.boldText, styles.text]}>#</html.span>
        )}
      </html.div>
    </>
  );
  // SectionHeading.svelte's anchor carries the section's fragment on the web; its plain click copies.
  const anchor =
    Platform.OS === 'web' ? (
      <RsdPageAnchor
        {...focusRingHost('radiusBlob2')}
        href={`#${section.id}`}
        onFollow={onCopy}
        aria-label={name}
        style={style}
      >
        {face}
      </RsdPageAnchor>
    ) : (
      <RsdPressable
        {...focusRingHost('radiusBlob2')}
        type="button"
        role="link"
        aria-label={name}
        style={style}
        onClick={onCopy}
      >
        {face}
      </RsdPressable>
    );
  return (
    <html.div
      style={[styles.header, wide && styles.wide(PRIVACY_LAYOUT.railGap - LINK_TARGET_PX)]}
      onPointerEnter={(event: { pointerType?: string }) =>
        setHovered(event.pointerType === 'mouse')
      }
      onPointerLeave={() => setHovered(false)}
    >
      {wide ? anchor : null}
      <html.h3 style={[controls.boldText, styles.title]}>{section.label}</html.h3>
      {wide ? null : anchor}
    </html.div>
  );
}
