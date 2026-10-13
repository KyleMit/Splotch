import { useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { css, html } from 'react-strict-dom';
import { installPrompt } from '../platform/installPrompt';
import type { InstallTextPart } from '../install/installCopy';
import {
  INSTALL_GUIDE_COPY,
  exitGuideStepParts,
  installGuideStepParts,
  lockGuideStepParts,
  type LockOs,
} from '../install/installGuideCopy';
import { isDeviceLocked } from '../platform/deviceLock';
import type { InstallDeviceOs } from '../install/installPolicy';
import { useInstallSnapshot } from '../install/useInstallBanner';
import { useShareButtonLocation } from '../install/shareLocation';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import { styles as controlStyles } from './controls';
import { RsdButton } from './RsdButton';
import { RsdDisclosure } from './RsdDisclosure';
import { RsdIcon } from './RsdIcon';
import { InstallText } from './RsdInstallParts';
import { RsdList } from './RsdList';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdStepNumber } from './RsdStepNumber';
import { colors, dimensions, motion } from './tokens.css';

// SetupInstructions.svelte's literals, local for the StyleX web compile;
// native-settings-info-drift.test.mjs reads each back from that source.
const OS_HEADING_GAP_PX = 10;
const SECTION_GAP_PX = 16;
const SUMMARY_PADDING_PX = 16;
const STEP_ICON_PX = 17;
const STEPS_PADDING_PX = { block: 16, right: 24, left: 40 } as const;
const STEP_GAP_PX = 8;
const STEPS_LINE_HEIGHT = 1.8;
const NOTE_PADDING_PX = { block: 16, inline: 24 } as const;
const NOTE_JOIN_PADDING_PX = 8;
const NOTE_LINE_HEIGHT = 1.6;
const ONE_TAP_GAP_PX = 20;
const ONE_TAP_HINT_GAP_PX = 8;
const ONE_TAP_ICON_PX = 20;
const STEPS_FONT_PX = 16;
const LOCKED_CHECK_GAP_PX = 8;

const styles = css.create({
  guide: { display: 'flex', flexDirection: 'column' },
  oneTap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: ONE_TAP_GAP_PX,
  },
  oneTapHint: {
    marginTop: ONE_TAP_HINT_GAP_PX,
    marginBottom: 0,
    fontSize: dimensions.fontSizeSm,
    color: colors.textSoft,
    textAlign: 'center',
  },
  osHeading: { marginBottom: OS_HEADING_GAP_PX },
  section: { marginTop: SECTION_GAP_PX },
  summary: {
    padding: SUMMARY_PADDING_PX,
    fontSize: dimensions.fontSizeLg,
    color: colors.text,
    textAlign: 'left',
    backgroundColor: {
      default: colors.surface2,
      '@media (hover: hover)': { default: colors.surface2, ':hover': colors.surfaceHover },
    },
    transitionProperty: 'background-color',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  summaryMark: { fontSize: dimensions.fontSizeXl },
  summaryText: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    gap: dimensions.space2,
  },
  summaryLabel: { flexShrink: 1 },
  // SetupInstructions.svelte's .install-check sits apart from the title by its own margin.
  lockedCheck: { marginLeft: LOCKED_CHECK_GAP_PX },
  check: {
    color: colors.successText,
    fontSize: dimensions.fontSizeLg,
  },
  steps: {
    paddingTop: STEPS_PADDING_PX.block,
    paddingBottom: STEPS_PADDING_PX.block,
    paddingRight: STEPS_PADDING_PX.right,
    color: colors.textSoft,
    fontSize: STEPS_FONT_PX,
    lineHeight: STEPS_LINE_HEIGHT,
  },
  bulletSteps: { paddingRight: STEPS_PADDING_PX.right },
  joinedTop: { paddingTop: NOTE_JOIN_PADDING_PX },
  note: {
    margin: 0,
    paddingTop: NOTE_PADDING_PX.block,
    paddingBottom: NOTE_PADDING_PX.block,
    paddingLeft: NOTE_PADDING_PX.inline,
    paddingRight: NOTE_PADDING_PX.inline,
    fontSize: dimensions.fontSizeSm,
    color: colors.textSoft,
    lineHeight: NOTE_LINE_HEIGHT,
  },
  lockHeading: {
    margin: 0,
    paddingTop: SUMMARY_PADDING_PX,
    paddingLeft: SUMMARY_PADDING_PX,
    paddingRight: SUMMARY_PADDING_PX,
    fontSize: dimensions.fontSizeLg,
    color: colors.text,
  },
});

function StepList({
  steps,
  ordered,
  joinedTop = false,
}: {
  steps: readonly (readonly InstallTextPart[])[];
  ordered: boolean;
  joinedTop?: boolean;
}) {
  const theme = useDrawingTheme();
  return (
    <html.div style={[styles.steps, joinedTop && styles.joinedTop]}>
      <RsdList
        ordered={ordered}
        fontSizePx={STEPS_FONT_PX}
        lineHeightPx={STEPS_FONT_PX * STEPS_LINE_HEIGHT}
        indentPx={STEPS_PADDING_PX.left}
        gapPx={STEP_GAP_PX}
        markerColor={theme.textSoft}
        items={steps.map((parts, index) => (
          <InstallText key={index} parts={parts} iconPx={STEP_ICON_PX} />
        ))}
      />
    </html.div>
  );
}

function InstallSteps({ os }: { os: InstallDeviceOs }) {
  const shareLocation = useShareButtonLocation();
  const steps = installGuideStepParts(os, shareLocation, installPrompt?.outsideSafari === true);
  return (
    <html.div>
      <StepList steps={steps} ordered />
      {os === 'desktop' ? (
        <html.p style={[styles.note, styles.joinedTop]}>{INSTALL_GUIDE_COPY.desktopNote}</html.p>
      ) : null}
    </html.div>
  );
}

// A computer has no lock to turn on, so its arm is a caveat and the nearest substitutes.
function LockSteps({ os }: { os: InstallDeviceOs }) {
  if (os !== 'desktop') return <StepList steps={lockGuideStepParts(os)} ordered />;
  return (
    <html.div>
      <html.p style={styles.note}>{INSTALL_GUIDE_COPY.desktopLockNote}</html.p>
      <StepList steps={lockGuideStepParts(os)} ordered={false} joinedTop />
    </html.div>
  );
}

function StepSummary({ number, label, done }: { number: number; label: string; done: boolean }) {
  return (
    <html.div style={styles.summaryText}>
      <RsdStepNumber number={number} size="summary" shape="disc" />
      <html.span style={[controlStyles.semiboldText, styles.summaryLabel]}>{label}</html.span>
      {done ? <html.span style={[controlStyles.boldText, styles.check]}>✓</html.span> : null}
    </html.div>
  );
}

function GuideStep({
  number,
  label,
  done,
  first,
  children,
}: {
  number: number;
  label: string;
  done: boolean;
  first: boolean;
  children: ReactNode;
}) {
  return (
    <html.div style={!first && styles.section}>
      <RsdDisclosure
        summary={<StepSummary number={number} label={label} done={done} />}
        summaryStyle={styles.summary}
        markStyle={styles.summaryMark}
      >
        <html.div>{children}</html.div>
      </RsdDisclosure>
    </html.div>
  );
}

function OneTapInstall() {
  const [installing, setInstalling] = useState(false);
  const owner = installPrompt;
  if (!owner) return null;
  return (
    <html.div style={styles.oneTap}>
      <RsdButton
        variant="brand"
        disabled={installing}
        icon={<RsdIcon name="home" size={ONE_TAP_ICON_PX} ink={DRAWING_ON_BRAND} muted={false} />}
        onPress={() => {
          setInstalling(true);
          void owner.prompt().finally(() => setInstalling(false));
        }}
      >
        {INSTALL_GUIDE_COPY.oneTap}
      </RsdButton>
      <html.p style={styles.oneTapHint}>{INSTALL_GUIDE_COPY.oneTapHint}</html.p>
    </html.div>
  );
}

// Whether Guided Access or App Pinning holds the app, asked each time the guide mounts, which is
// each time Settings opens. Until the answer arrives, and if it never does, the lock reads as off.
function useDeviceLocked() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let current = true;
    void isDeviceLocked().then((answer) => {
      if (current) setLocked(answer);
    });
    return () => {
      current = false;
    };
  }, []);
  return locked;
}

// An installed app has one step left, so the lock title stands as the heading over flat steps. Once
// the lock is on, the heading confirms it and the steps show the way back out.
function NativeLockGuide({ os }: { os: LockOs }) {
  const locked = useDeviceLocked();
  return (
    <html.section style={styles.guide}>
      <html.h3 style={[controlStyles.semiboldText, styles.lockHeading]}>
        {locked ? INSTALL_GUIDE_COPY.lockedTitle[os] : INSTALL_GUIDE_COPY.lockTitle[os]}
        {locked ? (
          <html.span style={[controlStyles.boldText, styles.check, styles.lockedCheck]}>
            {' ✓'}
          </html.span>
        ) : null}
      </html.h3>
      <StepList steps={locked ? exitGuideStepParts(os) : lockGuideStepParts(os)} ordered />
    </html.section>
  );
}

// The shipping Settings Install section (SetupInstructions.svelte). The web shows the steps for
// the one device family it detected, under that family's label: install the app, then keep kids in
// it, each a numbered disclosure. Chromium's one-tap install sits above them. A native app is
// already installed, so it shows the lock steps for the platform it runs on.
export function RsdInstallGuide() {
  const snapshot = useInstallSnapshot(installPrompt);
  if (!installPrompt) return <NativeLockGuide os={Platform.OS === 'android' ? 'android' : 'ios'} />;
  const os = installPrompt.deviceOs;
  return (
    <html.div style={styles.guide}>
      {snapshot.mode === 'oneTap' ? <OneTapInstall /> : null}
      <html.section style={styles.guide}>
        <html.div style={styles.osHeading}>
          <RsdRuleLabel as="h3" strong>
            {INSTALL_GUIDE_COPY.osLabel[os]}
          </RsdRuleLabel>
        </html.div>
        <GuideStep number={1} label={INSTALL_GUIDE_COPY.title} done={snapshot.installed} first>
          <InstallSteps os={os} />
        </GuideStep>
        <GuideStep number={2} label={INSTALL_GUIDE_COPY.lockTitle[os]} done={false} first={false}>
          <LockSteps os={os} />
        </GuideStep>
      </html.section>
    </html.div>
  );
}
