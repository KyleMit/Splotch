import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { RsdAction, styles as controlStyles } from './controls';
import { installPrompt } from '../platform/installPrompt';
import { INSTALL_BANNER_COPY, INSTALL_PROMPT_COPY, iosBannerSteps } from '../install/installCopy';
import { useInstallBanner } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';

const BANNER_BORDER_PX = 2;

const styles = css.create({
  banner: {
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
  if (banner.parting)
    return (
      <html.div role="status" style={styles.banner}>
        <html.p>{INSTALL_BANNER_COPY.parting}</html.p>
      </html.div>
    );
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
