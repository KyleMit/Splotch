import { StyleSheet, View } from 'react-native';
import { css, html } from 'react-strict-dom';
import { DRAWING_SCALE } from '../drawing/theme';
import { HeaderControl } from './DialogHeader';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

// SaveFailureBanner.svelte's literals that no token carries. Local because the StyleX web compile
// resolves only local constants inside css.create; rsd-native-drawing-frame.test.mjs reads the
// shipping component and fails on divergence.
export const BANNER_MAX_WIDTH_PX = 420;
export const BANNER_MASCOT_PX = 40;
export const BANNER_LINE_HEIGHT = 1.3;
// The right inset keeps the banner clear of the Clear Button hanging off that edge.
export const BANNER_CLEAR_RESERVE_PX = 78;
// The dismiss blob's outline sits flush with the card's padding corner.
export const BANNER_DISMISS_OVERHANG_PX = -2;

export type FailureBannerAction = Readonly<{
  label: string;
  disabled: boolean;
  onPress: () => void;
}>;

// One failure the banner shows: a refused save the child may dismiss, or a failure only its
// action can clear.
export type FailureBannerModel = Readonly<{
  key: string;
  heading: string;
  detail: string;
}> &
  (
    | Readonly<{ onDismiss: () => void; action?: never }>
    | Readonly<{ action: FailureBannerAction; onDismiss?: never }>
  );

// The dock passes touches between and around the banners through to the paper.
const dock = StyleSheet.create({
  stack: {
    position: 'absolute',
    top: DRAWING_SCALE.space4,
    left: DRAWING_SCALE.space4,
    right: BANNER_CLEAR_RESERVE_PX,
    alignItems: 'center',
    gap: DRAWING_SCALE.space3,
  },
});

const styles = css.create({
  banner: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: BANNER_MAX_WIDTH_PX,
    padding: dimensions.space4,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.borderWarmStrong,
    borderRadius: dimensions.radiusLg,
    boxShadow: colors.floatShadow,
  },
  main: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dimensions.space3,
  },
  mascot: { flexShrink: 0, width: BANNER_MASCOT_PX, height: BANNER_MASCOT_PX },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space1,
    textAlign: 'left',
  },
  heading: {
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
    lineHeight: BANNER_LINE_HEIGHT,
  },
  detail: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: BANNER_LINE_HEIGHT,
  },
  dismiss: {
    flexShrink: 0,
    marginTop: BANNER_DISMISS_OVERHANG_PX,
    marginRight: BANNER_DISMISS_OVERHANG_PX,
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: dimensions.space2,
    marginTop: dimensions.space3,
  },
});

// The shipping Save Failure Banner: a raised card pinned to the top of the paper, Dottie with
// the hiccup beside the heading and detail, the outlined Dismiss, and the action that fixes it.
// The announcement is RsdDrawingStatus's, which stays mounted while this one comes and goes.
export function RsdFailureBanner({ failures }: { failures: readonly FailureBannerModel[] }) {
  return (
    <View testID="rsd-failure-banners" pointerEvents="box-none" style={dock.stack}>
      {failures.map((failure) => (
        <html.div key={failure.key} data-testid="rsd-failure-banner" style={styles.banner}>
          <html.div style={styles.main}>
            <html.div aria-hidden style={styles.mascot}>
              <RsdIcon name="dottie-hiccup" size={BANNER_MASCOT_PX} ink={undefined} muted={false} />
            </html.div>
            <html.div style={styles.copy}>
              <html.strong style={[controlStyles.boldText, styles.heading]}>
                {failure.heading}
              </html.strong>
              <html.span style={styles.detail}>{failure.detail}</html.span>
            </html.div>
            {failure.onDismiss ? (
              <html.div style={styles.dismiss}>
                <HeaderControl
                  kind="close"
                  label="Dismiss"
                  disabled={false}
                  onClick={failure.onDismiss}
                />
              </html.div>
            ) : null}
          </html.div>
          {failure.action ? (
            <html.div style={styles.actions}>
              <RsdButton
                variant="brand"
                size="md"
                disabled={failure.action.disabled}
                onPress={failure.action.onPress}
              >
                {failure.action.label}
              </RsdButton>
            </html.div>
          ) : null}
        </html.div>
      ))}
    </View>
  );
}
