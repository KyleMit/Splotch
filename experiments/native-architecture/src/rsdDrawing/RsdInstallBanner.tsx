import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { RsdAction, styles as controlStyles } from './controls';
import { installPrompt } from '../platform/installPrompt';
import { INSTALL_BANNER_COPY, INSTALL_PROMPT_COPY, iosBannerSteps } from '../install/installCopy';
import { useInstallBanner } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';

const BANNER_BORDER_PX = 2;
// The shipping Install Banner's width cap, so the card reads the same on a tablet.
const BANNER_MAX_WIDTH_PX = 420;
// The tallest share of the screen the card may cover; longer instructions scroll.
const BANNER_MAX_HEIGHT = '60%';

// The banner floats over the bottom of the drawing screen, as the shipping one does,
// so showing it or expanding its steps never takes space from the paper. Only the
// card itself takes touches; the rest of the strip passes them to the paper.
const styles = css.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: BANNER_MAX_HEIGHT,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxSizing: 'border-box',
    padding: dimensions.space4,
    pointerEvents: 'none',
  },
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

export function RsdInstallBanner({ strokes, hidden }: { strokes: number; hidden: boolean }) {
  const banner = useInstallBanner(installPrompt, strokes, hidden);
  const shareLocation = useShareButtonLocation();
  if (!banner.shown) return null;
  return (
    <html.div style={styles.overlay}>
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
