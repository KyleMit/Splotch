import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { css, html } from 'react-strict-dom';
import {
  BANNER_ENTER_MS,
  BANNER_EXIT_MS,
  BANNER_FLY_PX,
} from '../../../../web/src/lib/components/bannerMotion';
import { CALM_FADE_MS } from '../../../../web/src/lib/motionDurations';
import { DRAWING_SCALE } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { Animated, Easing } from '../platform/animated';
import { HeaderControl } from './DialogHeader';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';
import { PALETTE_FLOWS, paletteAxis } from './paletteGeometry';
import { useBareToolbar } from './toolbarSkin';

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

// svelte/easing's backOut, which the shipping enter uses, and cubicOut, svelte fly's default,
// which its exit uses.
const BACK_OUT = Easing.out(Easing.back(1.70158));
const CUBIC_OUT = Easing.out(Easing.cubic);

// What an action does, which stays its identity while its label changes ("Try again" reads
// "Saving…" while it runs), so the control a parent pressed keeps its focus.
type FailureBannerActionId = 'retry' | 'settings';

export type FailureBannerAction = Readonly<{
  id: FailureBannerActionId;
  label: string;
  variant: 'brand' | 'wash';
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}>;

// One failure the banner shows: its words, the Dismiss a failure the parent may set aside offers,
// and the actions that fix it.
export type FailureBannerModel = Readonly<{
  key: string;
  heading: string;
  detail: string;
  onDismiss: (() => void) | null;
  actions: readonly FailureBannerAction[];
}>;

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
  card: { width: '100%', alignItems: 'center' },
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

type Shown = Readonly<{ model: FailureBannerModel; present: boolean }>;
type Presence = Readonly<{
  previous: readonly FailureBannerModel[];
  leaving: readonly FailureBannerModel[];
}>;

const absentFrom = (failures: readonly FailureBannerModel[]) => (old: FailureBannerModel) =>
  !failures.some((failure) => failure.key === old.key);

// Each failure that leaves keeps its card, its last words and its motion until its exit has
// played, as Svelte freezes an outroing block; one that comes back before then is present again.
// A departure is found while rendering, so the card is never unmounted on its way out: the render
// that drops a failure already shows it leaving.
function useBannerPresence(failures: readonly FailureBannerModel[]) {
  const [presence, setPresence] = useState<Presence>({ previous: failures, leaving: [] });
  let { leaving } = presence;
  if (presence.previous !== failures) {
    const departed = presence.previous.filter(absentFrom(failures));
    leaving = [
      ...leaving.filter((old) => absentFrom(failures)(old) && absentFrom(departed)(old)),
      ...departed,
    ];
    setPresence({ previous: failures, leaving });
  }
  const shown: Shown[] = [
    ...failures.map((model) => ({ model, present: true })),
    ...leaving.map((model) => ({ model, present: false })),
  ];
  return {
    shown,
    gone: (key: string) =>
      setPresence((current) => ({
        ...current,
        leaving: current.leaving.filter((old) => old.key !== key),
      })),
  };
}

// SaveFailureBanner.svelte's fly: down from above the top edge with a slight overshoot as it
// comes, back up as it goes, and under Reduce Motion a short fade both ways.
function useBannerMotion(present: boolean, gone: () => void) {
  const calm = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const goneRef = useRef(gone);
  goneRef.current = gone;
  useEffect(() => {
    const timing = present
      ? { duration: calm ? CALM_FADE_MS : BANNER_ENTER_MS, easing: calm ? Easing.linear : BACK_OUT }
      : {
          duration: calm ? CALM_FADE_MS : BANNER_EXIT_MS,
          easing: calm ? Easing.linear : CUBIC_OUT,
        };
    const motion = Animated.timing(progress, {
      toValue: present ? 1 : 0,
      ...timing,
      useNativeDriver: true,
    });
    motion.start(({ finished }) => {
      if (finished && !present) goneRef.current();
    });
    return () => motion.stop();
  }, [present, calm, progress]);
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  if (calm) return { opacity };
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-BANNER_FLY_PX, 0] });
  return { opacity, transform: [{ translateY }] };
}

function BannerCard({
  failure,
  present,
  onGone,
}: {
  failure: FailureBannerModel;
  present: boolean;
  onGone: () => void;
}) {
  const motion = useBannerMotion(present, onGone);
  return (
    <Animated.View pointerEvents={present ? 'box-none' : 'none'} style={[dock.card, motion]}>
      <html.div data-testid="rsd-failure-banner" style={styles.banner}>
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
        {failure.actions.length > 0 ? (
          <html.div style={styles.actions}>
            {failure.actions.map((action) => (
              <RsdButton
                key={action.id}
                variant={action.variant}
                size="md"
                busy={action.busy}
                disabled={action.disabled}
                onPress={action.onPress}
              >
                {action.label}
              </RsdButton>
            ))}
          </html.div>
        ) : null}
      </html.div>
    </Animated.View>
  );
}

// The shipping Save Failure Banner: a raised card pinned to the top of the paper, Dottie with
// the hiccup beside the heading and detail, the outlined Dismiss, and the actions that fix it.
// The announcement is RsdDrawingStatus's, which stays mounted while this one comes and goes.
export function RsdFailureBanner({ failures }: { failures: readonly FailureBannerModel[] }) {
  const { shown, gone } = useBannerPresence(failures);
  const window = useWindowDimensions();
  const bare = useBareToolbar();
  // Raised's paper starts after the palette; Flat's paper runs beneath it.
  const paletteTop = bare && paletteAxis(window) === 'row' ? PALETTE_FLOWS.row.extentPx : 0;
  return (
    <View
      testID="rsd-failure-banners"
      pointerEvents="box-none"
      style={[dock.stack, { top: DRAWING_SCALE.space4 + paletteTop }]}
    >
      {shown.map(({ model, present }) => (
        <BannerCard
          key={model.key}
          failure={model}
          present={present}
          onGone={() => gone(model.key)}
        />
      ))}
    </View>
  );
}
