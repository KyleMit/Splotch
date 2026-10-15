import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../drawing/DrawingAppearance';
import { setDocumentTitle } from '../platform/appPath';
import { bootAppearance } from '../platform/bootAppearance';
import { displayFontSize } from './displayType';
import { fontTheme } from './fontTheme';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { styles as controlStyles } from './controls';
import { colors, darkTheme, dimensions, fonts } from './tokens.css';

// ErrorScreen.svelte's copy and the literals it writes beside its tokens. Local because the StyleX
// web compile resolves only local constants inside css.create; rsd-native-error-screen.test.mjs
// reads the shipping component and fails on divergence.
export const ERROR_SCREEN_COPY = {
  documentTitle: 'Oops! · Splotch',
  title: 'Oops!',
  lines: ['Something went wrong.', "Let's start a fresh drawing."],
  restart: 'Start over',
} as const;
export const ERROR_DOTTIE_PX = 128;
export const ERROR_COPY_MAX_WIDTH_PX = 320;
// The restart is the hero Button held to a wider floor than its label needs.
export const ERROR_RESTART_MIN_WIDTH_PX = 240;

const styles = css.create({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space4,
    padding: dimensions.space6,
    textAlign: 'center',
    fontFamily: fonts.family,
    backgroundColor: colors.appBg,
    color: colors.textStrong,
  },
  dottie: { width: ERROR_DOTTIE_PX, height: ERROR_DOTTIE_PX },
  title: (fontSize: number) => ({ margin: 0, fontSize, color: colors.textStrong }),
  copy: {
    margin: 0,
    maxWidth: ERROR_COPY_MAX_WIDTH_PX,
    fontSize: dimensions.fontSizeMd,
    color: colors.textSoft,
    textAlign: 'center',
  },
  restart: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: ERROR_RESTART_MIN_WIDTH_PX,
    marginTop: dimensions.space2,
  },
});

// The shipping Error Screen, shown when the drawing paper's renderer fails: stumped Dottie, the
// apology and the hero Start over, which restarts the app on a fresh drawing as shipping's does.
export function RsdErrorScreen({ onRestart }: { onRestart: () => Promise<void> }) {
  const window = useWindowDimensions();
  // One press owns the restart until the replacement screen mounts.
  const [restarting, setRestarting] = useState(false);
  // The tab names the screen while it shows, as shipping's title travels with its Error Screen.
  useEffect(() => {
    const previous = setDocumentTitle(ERROR_SCREEN_COPY.documentTitle);
    return () => {
      setDocumentTitle(previous);
    };
  }, []);
  return (
    <html.div role="alert" style={styles.screen}>
      <html.div aria-hidden style={styles.dottie}>
        <RsdIcon name="dottie-stumped" size={ERROR_DOTTIE_PX} ink={undefined} muted={false} />
      </html.div>
      <html.h1 style={[controlStyles.boldText, styles.title(displayFontSize(window.width))]}>
        {ERROR_SCREEN_COPY.title}
      </html.h1>
      <html.p style={styles.copy}>
        {ERROR_SCREEN_COPY.lines[0]}
        <html.br />
        {ERROR_SCREEN_COPY.lines[1]}
      </html.p>
      <html.div style={styles.restart}>
        <RsdButton
          variant="brand"
          size="hero"
          disabled={restarting}
          onPress={() => {
            setRestarting(true);
            void onRestart();
          }}
        >
          {ERROR_SCREEN_COPY.restart}
        </RsdButton>
      </html.div>
    </html.div>
  );
}

const crash = css.create({
  root: { flexGrow: 1, backgroundColor: colors.appBg },
});

// The Error Screen on its own, where a render error took the drawing screen and its themed frame
// with it (RsdScreenBoundary). It wears the theme the app booted with.
export function RsdCrashScreen({ onRestart }: { onRestart: () => Promise<void> }) {
  return (
    <DrawingAppearanceProvider preference={bootAppearance()}>
      <CrashRoot onRestart={onRestart} />
    </DrawingAppearanceProvider>
  );
}

function CrashRoot({ onRestart }: { onRestart: () => Promise<void> }) {
  const theme = useDrawingAppearance();
  return (
    <html.div style={[crash.root, fontTheme, theme === 'dark' && darkTheme]}>
      <RsdErrorScreen onRestart={onRestart} />
    </html.div>
  );
}
