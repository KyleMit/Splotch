import { useState } from 'react';
import { html } from 'react-strict-dom';
import { RsdAction, styles } from './controls';
import { installPrompt } from '../platform/installPrompt';
import { INSTALL_GUIDE_COPY, installGuideSteps } from '../install/installCopy';
import { useInstallSnapshot } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';

// The Settings home of the install steps the banner hands off to. It ignores the
// banner's dismissal, so a parent can always find it; native apps have no install step.
export function RsdInstallGuide() {
  const snapshot = useInstallSnapshot(installPrompt);
  const shareLocation = useShareButtonLocation();
  const [installing, setInstalling] = useState(false);
  if (!installPrompt) return null;
  const owner = installPrompt;
  const os = owner.deviceOs;
  return (
    <html.div style={styles.stack}>
      <html.h2 style={styles.boldText}>
        {snapshot.installed ? `${INSTALL_GUIDE_COPY.title} ✓` : INSTALL_GUIDE_COPY.title}
      </html.h2>
      {snapshot.mode === 'oneTap' ? (
        <html.div style={styles.stack}>
          <RsdAction
            label={INSTALL_GUIDE_COPY.oneTap}
            disabled={installing}
            onClick={() => {
              setInstalling(true);
              void owner.prompt().finally(() => setInstalling(false));
            }}
          />
          <html.p>{INSTALL_GUIDE_COPY.oneTapHint}</html.p>
        </html.div>
      ) : null}
      <html.span>{INSTALL_GUIDE_COPY.osLabel[os]}</html.span>
      <html.ol>
        {os === 'ios' && owner.outsideSafari ? (
          <html.li>{INSTALL_GUIDE_COPY.openInSafari}</html.li>
        ) : null}
        {installGuideSteps(os, shareLocation).map((step) => (
          <html.li key={step}>{step}</html.li>
        ))}
      </html.ol>
      {os === 'desktop' ? <html.p>{INSTALL_GUIDE_COPY.desktopNote}</html.p> : null}
    </html.div>
  );
}
