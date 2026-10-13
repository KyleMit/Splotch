import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { EDGE_INSET_PX } from './edgeLayout';
import { CONTROL_GAP, TOUCH_TARGET } from '../drawing/theme';
import { RsdAction, styles as controlStyles } from './controls';
import { installPrompt } from '../platform/installPrompt';
import { INSTALL_BANNER_COPY, INSTALL_PROMPT_COPY, iosBannerSteps } from '../install/installCopy';
import { useInstallBanner } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';

const BANNER_BORDER_PX = 2;
// The shipping Install Banner's width cap, so the card reads the same on a tablet.
const BANNER_MAX_WIDTH_PX = 420;
// How far an edge layout corner control of this size reaches into the paper area: Clear (top
// right), Settings (bottom right) and the drawer chevron (bottom left, at the Button Size) each
// sit one inset from their corner, and the card keeps one more gap from them.
function cornerControlReach(controlSize: number) {
  return EDGE_INSET_PX + Math.max(controlSize, TOUCH_TARGET) + CONTROL_GAP;
}

// The banner floats over the paper area, as the shipping one floats in its bottom dock,
// so showing it or expanding its steps never takes space from the paper. Rendered inside
// that area, it sits beside the swatch bar rather than over it, and its insets keep it
// between the bottom corner controls and below Clear; longer steps scroll inside the
// card. Only the card takes touches; the rest of the strip passes them to the paper.
const styles = css.create({
  // A dynamic style: StyleX compiles static styles at build time and cannot read the
  // edge layout's constants from another module, so they arrive as arguments.
  overlay: (reach: number, inset: number) => ({
    position: 'absolute',
    top: reach,
    left: reach,
    right: reach,
    bottom: inset,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    pointerEvents: 'none',
  }),
  banner: {
    pointerEvents: 'auto',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: BANNER_MAX_WIDTH_PX,
    minHeight: 0,
    flexShrink: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space3,
    padding: dimensions.space4,
    borderRadius: dimensions.radiusMd,
    borderWidth: BANNER_BORDER_PX,
    borderStyle: 'solid',
    borderColor: colors.brandSolid,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  copy: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
});

export function RsdInstallBanner({
  strokes,
  hidden,
  controlSize,
}: {
  strokes: number;
  hidden: boolean;
  controlSize: number;
}) {
  const banner = useInstallBanner(installPrompt, strokes, hidden);
  const shareLocation = useShareButtonLocation();
  if (!banner.shown) return null;
  return (
    <html.div style={styles.overlay(cornerControlReach(controlSize), EDGE_INSET_PX)}>
      {banner.parting ? (
        <html.div role="status" style={styles.banner}>
          <html.p>{INSTALL_BANNER_COPY.parting}</html.p>
        </html.div>
      ) : (
        <InstallCard banner={banner} shareLocation={shareLocation} />
      )}
    </html.div>
  );
}

function InstallCard({
  banner,
  shareLocation,
}: {
  banner: ReturnType<typeof useInstallBanner>;
  shareLocation: string;
}) {
  const copy = INSTALL_PROMPT_COPY[banner.stage];
  const oneTap = banner.mode === 'oneTap';
  return (
    <html.div role="region" aria-label={copy.heading} style={styles.banner}>
      <html.div style={styles.copy}>
        <html.strong>{copy.heading}</html.strong>
        <html.span>{copy.detail}</html.span>
      </html.div>
      <html.div style={controlStyles.row}>
        <RsdAction
          label={
            oneTap
              ? INSTALL_BANNER_COPY.install
              : banner.hintOpen
                ? INSTALL_BANNER_COPY.hideHint
                : INSTALL_BANNER_COPY.showHint
          }
          disabled={banner.busy}
          onClick={() => {
            void banner.primary();
          }}
        />
        <RsdAction label={INSTALL_BANNER_COPY.dismiss} onClick={banner.dismiss} />
      </html.div>
      {banner.hintOpen && !oneTap ? (
        banner.mode === 'ios' ? (
          <html.ol>
            {iosBannerSteps(shareLocation).map((step) => (
              <html.li key={step}>{step}</html.li>
            ))}
          </html.ol>
        ) : (
          <html.p>{INSTALL_BANNER_COPY.androidHint}</html.p>
        )
      ) : null}
    </html.div>
  );
}
