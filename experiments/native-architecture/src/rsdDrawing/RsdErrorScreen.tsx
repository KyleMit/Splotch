import { useWindowDimensions } from 'react-native';
import { css, html } from 'react-strict-dom';
import { displayFontSize } from './displayType';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

// ErrorScreen.svelte's copy and the literals it writes beside its tokens. Local because the StyleX
// web compile resolves only local constants inside css.create; rsd-native-error-screen.test.mjs
// reads the shipping component and fails on divergence.
export const ERROR_SCREEN_COPY = {
  title: 'Oops!',
  lines: ['Something went wrong.', "Let's start a fresh drawing."],
  restart: 'Start over',
} as const;
export const ERROR_DOTTIE_PX = 128;
export const ERROR_COPY_MAX_WIDTH_PX = 320;

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
  restart: { marginTop: dimensions.space2 },
});

// The shipping Error Screen, shown when the drawing paper's renderer fails: stumped Dottie, the
// apology and the hero Start over, which brings the paper back.
export function RsdErrorScreen({
  disabled,
  onRestart,
}: {
  disabled: boolean;
  onRestart: () => void;
}) {
  const window = useWindowDimensions();
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
        <RsdButton variant="brand" size="hero" disabled={disabled} onPress={onRestart}>
          {ERROR_SCREEN_COPY.restart}
        </RsdButton>
      </html.div>
    </html.div>
  );
}
