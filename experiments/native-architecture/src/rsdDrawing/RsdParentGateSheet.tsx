import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { Svg, Path } from '../platform/svg';
import { css, html } from 'react-strict-dom';
import { Animated } from '../platform/animated';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { useDialogTitleId } from './dialogScope';
import { RsdParentGateKeypad } from './RsdParentGateKeypad';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { RsdIcon } from './RsdIcon';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { styles as controlStyles } from './controls';
import { blobPath, type BlobShape } from './blob';
import { gateSizeClass, type GateSizeClass } from './modalGeometry';
import { PARENT_GATE_METRICS } from '../parentCenter/parentGateMetrics';
import { brandColors, colors, dimensions, fonts, motion } from './tokens.css';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { paletteHex } from '../drawing/palette';
import { colorFamilyShade } from '../../../../web/src/lib/hexPickerLayout';
import { PARENT_GATE_COPY } from '../parentCenter/parentGateCopy';
import type { ParentGateState } from '../parentCenter/parentGate';
import type { DrawingProductOwner } from '../product/createDrawingProduct';
import { useParentGateMotion } from '../parentCenter/useParentGateMotion';
import { GateKeyboard } from '../platform/gateKeyboard';
import { RsdGateEquation } from './RsdGateEquation';

// Operand splats wear crayon hues, not chrome tokens: palette Purple, and the picker's mid-blue
// because palette Blue misses 3:1 against the white digit (ParentalGateProblem.svelte).
const OPERAND_FILLS = [paletteHex('Purple'), colorFamilyShade('blues', 4)] as const;
const OPERAND_SHAPES = ['radiusBlob1', 'radiusBlob2'] as const satisfies readonly BlobShape[];
const DAB_SHAPE: BlobShape = 'radiusBlob3';
const DAB_EDGE_PX = 2;
// A dashed CSS border draws dashes about three edges long with gaps about two; the dab's outline is
// a path, so its dashes are spelled out.
const DAB_DASH = `${3 * DAB_EDGE_PX} ${2 * DAB_EDGE_PX}`;
const HEADER_GAP_PX = 3;
const SUCCESS_GAP_PX = 10;
const SUCCESS_BADGE_PX = 72;
const SUCCESS_ICON_PX = 40;
const FOOTER_MIN_HEIGHT_PX = 44;

const ignore = () => {};

function answerDabs(state: ParentGateState) {
  return Array.from(
    { length: String(state.x * state.y).length },
    (_, index) => state.input[index] ?? ''
  );
}

export function RsdParentGateSheet({
  owner,
  state,
  unlocked,
  visible,
  onDismiss,
}: {
  owner: DrawingProductOwner;
  state: ParentGateState;
  unlocked: boolean;
  visible: boolean;
  onDismiss: () => void;
}) {
  const offset = useParentGateMotion(state);
  const size = gateSizeClass(useWindowDimensions());
  // A correct answer is committed: the scrim, Escape and Back wait out the success hold rather than
  // close a card whose destination the answer already granted.
  const close = unlocked ? ignore : owner.gate.dismiss;
  return (
    <ModalShell
      visible={visible}
      onDismiss={() => {
        onDismiss();
        owner.gate.closed();
      }}
      label={PARENT_GATE_COPY.title}
      size="gate"
      onClose={close}
      header={unlocked ? null : <DialogHeader onClose={close} />}
    >
      {unlocked ? (
        <GateSuccess size={size} />
      ) : (
        <>
          <GateKeyboard onPress={owner.gate.press} />
          <Animated.View style={{ transform: [{ translateX: offset }] }}>
            <GateChallenge owner={owner} state={state} size={size} />
          </Animated.View>
        </>
      )}
    </ModalShell>
  );
}

function GateChallenge({
  owner,
  state,
  size,
}: {
  owner: DrawingProductOwner;
  state: ParentGateState;
  size: GateSizeClass;
}) {
  // Parent Center is where these checks are managed, so a challenge in front of it names that in
  // its subtitle and drops the footer offering the trip the parent is already on.
  const managing = state.feature === 'parentCenter';
  const landscape = size === 'phoneLandscape';
  const header = <GateHeader size={size} managing={managing} />;
  const problem = <GateProblem state={state} size={size} />;
  const keypad = (
    <RsdParentGateKeypad size={size} locked={state.locked} onPress={owner.gate.press} />
  );
  const footer = managing ? null : (
    <GateManageFooter size={size} onManage={owner.retargetParentCenter} />
  );
  // On a landscape phone a stacked card is taller than the screen, so the keypad stands beside the
  // problem and everything a parent taps and reads shares one screen.
  if (landscape)
    return (
      <html.div style={styles.main}>
        {header}
        <html.div style={styles.landscapeRow}>
          <html.div style={styles.landscapeProblem}>
            {problem}
            {footer}
          </html.div>
          {keypad}
        </html.div>
      </html.div>
    );
  return (
    <html.div style={styles.main}>
      {header}
      {problem}
      {keypad}
      {footer}
    </html.div>
  );
}

function GateHeader({ size, managing }: { size: GateSizeClass; managing: boolean }) {
  const landscape = size === 'phoneLandscape';
  return (
    <html.header style={[styles.header, landscape && styles.headerRow]}>
      <RsdSplotchyIcon size={PARENT_GATE_METRICS[size].mascot} />
      <html.div style={[styles.heading, landscape && styles.headingRow]}>
        <html.h2
          id={useDialogTitleId()}
          style={[
            controlStyles.boldText,
            styles.title,
            landscape ? styles.titleLandscape : styles.titleXl,
          ]}
        >
          {PARENT_GATE_COPY.title}
        </html.h2>
        <html.p
          style={[
            styles.subtitle,
            landscape ? styles.fontXs : size === 'phone' ? styles.fontSm : styles.fontMd,
          ]}
        >
          {managing ? PARENT_GATE_COPY.managingSubtitle : PARENT_GATE_COPY.subtitle}
        </html.p>
      </html.div>
    </html.header>
  );
}

function GateProblem({ state, size }: { state: ParentGateState; size: GateSizeClass }) {
  const metrics = PARENT_GATE_METRICS[size];
  return (
    <html.div data-testid="gate-problem">
      {/* The row's label carries the whole equation for assistive tech; the digits inside are
          hidden so the only "5" a screen reader finds is the keypad key. */}
      <RsdGateEquation
        role="img"
        aria-label={`What is ${state.x} times ${state.y}?`}
        style={[styles.equation, styles.gap(metrics.equationGap)]}
      >
        {[state.x, state.y].map((operand, index) => (
          <html.div key={index} aria-hidden style={styles.pair(metrics.equationGap)}>
            <GateOperand value={operand} index={index} size={metrics.operand} />
            <html.span style={styles.operator}>{index === 0 ? '×' : '='}</html.span>
          </html.div>
        ))}
        {answerDabs(state).map((digit, index) => (
          <GateDab
            key={index}
            digit={digit}
            width={metrics.dab.width}
            height={metrics.dab.height}
          />
        ))}
      </RsdGateEquation>
      <html.p
        aria-hidden
        style={[
          styles.error,
          styles.errorHeight(metrics.errorHeight),
          size === 'phoneLandscape' && styles.errorLandscape,
          (size === 'tablet' || size === 'largeTablet') && styles.fontSm,
        ]}
      >
        {state.message}
      </html.p>
      <RsdVisuallyHidden key={state.announcementId} live>
        {state.announcement}
      </RsdVisuallyHidden>
    </html.div>
  );
}

function GateOperand({ value, index, size }: { value: number; index: number; size: number }) {
  const shape = OPERAND_SHAPES[index] ?? OPERAND_SHAPES[0];
  const path = useMemo(() => blobPath(shape, size, size), [shape, size]);
  return (
    <html.div style={styles.splat(size)}>
      <Svg width={size} height={size} style={layers.blob} pointerEvents="none">
        <Path d={path} fill={OPERAND_FILLS[index] ?? OPERAND_FILLS[0]} />
      </Svg>
      <html.span style={styles.operandDigit}>{value}</html.span>
    </html.div>
  );
}

function GateDab({ digit, width, height }: { digit: string; width: number; height: number }) {
  const theme = useDrawingTheme();
  const filled = digit !== '';
  const path = useMemo(
    () => blobPath(DAB_SHAPE, width, height, filled ? 0 : DAB_EDGE_PX / 2),
    [width, height, filled]
  );
  return (
    <html.div aria-hidden data-filled={filled} style={styles.dab(width, height)}>
      <Svg width={width} height={height} style={layers.blob} pointerEvents="none">
        {filled ? (
          <Path d={path} fill={theme.brandWash} />
        ) : (
          <Path
            d={path}
            fill="none"
            stroke={theme.iconMuted}
            strokeWidth={DAB_EDGE_PX}
            strokeDasharray={DAB_DASH}
          />
        )}
      </Svg>
      <html.span style={styles.dabDigit}>{digit}</html.span>
    </html.div>
  );
}

// Says where the frequency of these checks is set and goes there; both named places lead to the
// same one tap, so the whole line is one target.
function GateManageFooter({ size, onManage }: { size: GateSizeClass; onManage: () => void }) {
  const theme = useDrawingTheme();
  const icon = PARENT_GATE_METRICS[size].footerIcon;
  const roomy = size === 'tablet' || size === 'largeTablet';
  return (
    <html.button
      type="button"
      onClick={onManage}
      style={[styles.footer, roomy ? styles.fontSm : styles.fontXs]}
    >
      <html.span style={styles.footerLead}>{PARENT_GATE_COPY.manageLead}</html.span>
      {/* Views, not spans: native renders a span as Text, where flex, gap and centring do nothing,
          so the icons sat on the text's baseline with no room around them (#3079). */}
      <html.div style={styles.footerPath}>
        <html.div style={styles.footerPlace}>
          <RsdIcon name="settings" size={icon} ink={theme.text} muted={false} />
          <html.span style={styles.footerPlaceName}>{PARENT_GATE_COPY.managePlace}</html.span>
        </html.div>
        <html.span aria-hidden style={styles.footerLead}>
          ›
        </html.span>
        <html.div style={styles.footerPlace}>
          <RsdIcon name="parent-center" size={icon} ink={theme.text} muted={false} />
          <html.span style={styles.footerPlaceName}>{PARENT_GATE_COPY.managePolicies}</html.span>
        </html.div>
      </html.div>
    </html.button>
  );
}

function GateSuccess({ size }: { size: GateSizeClass }) {
  const theme = useDrawingTheme();
  return (
    <html.div
      role="status"
      style={[styles.success, styles.minHeight(PARENT_GATE_METRICS[size].successMinHeight)]}
    >
      <html.div style={styles.badge}>
        <RsdIcon name="check" size={SUCCESS_ICON_PX} ink={theme.successText} muted={false} />
      </html.div>
      <html.h2
        id={useDialogTitleId()}
        style={[controlStyles.boldText, styles.title, styles.titleXl]}
      >
        {PARENT_GATE_COPY.unlocked}
      </html.h2>
      <html.p style={[styles.subtitle, styles.fontSm]}>{PARENT_GATE_COPY.unlockedSub}</html.p>
    </html.div>
  );
}

const layers = StyleSheet.create({
  blob: { position: 'absolute', top: 0, left: 0 },
});

const styles = css.create({
  main: { display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: HEADER_GAP_PX,
    marginBottom: dimensions.space3,
    textAlign: 'center',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'center', gap: dimensions.space2 },
  heading: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: HEADER_GAP_PX },
  headingRow: { alignItems: 'flex-start', textAlign: 'left' },
  title: {
    margin: 0,
    color: colors.textStrong,
  },
  titleXl: { fontSize: dimensions.fontSizeXl },
  titleLandscape: { fontSize: dimensions.fontSizeLg },
  subtitle: { margin: 0, color: colors.textSoft },
  fontXs: { fontSize: dimensions.fontSizeXs },
  fontSm: { fontSize: dimensions.fontSizeSm },
  fontMd: { fontSize: dimensions.fontSizeMd },
  landscapeRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space5,
  },
  landscapeProblem: {
    display: 'flex',
    flexDirection: 'column',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  equation: {
    position: 'static',
    boxSizing: 'content-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: (gap: number) => ({ gap }),
  pair: (gap: number) => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap }),
  splat: (size: number) => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: size,
    height: size,
  }),
  operandDigit: {
    position: 'relative',
    color: brandColors.onBrand,
    fontSize: dimensions.fontSizeXl,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  operator: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXl,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  dab: (width: number, height: number) => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width,
    height,
  }),
  dabDigit: {
    position: 'relative',
    color: colors.brandText,
    fontSize: dimensions.fontSizeXl,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  // A fixed-height line, so the message appearing does not shift the keypad.
  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: dimensions.space2,
    marginBottom: 0,
    color: colors.dangerText,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    textAlign: 'center',
  },
  errorHeight: (height: number) => ({ height }),
  errorLandscape: { marginTop: dimensions.space3 },
  footer: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space1,
    width: '100%',
    minHeight: FOOTER_MIN_HEIGHT_PX,
    marginTop: dimensions.space4,
    paddingBlock: dimensions.space3,
    paddingInline: 0,
    borderWidth: 0,
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
    backgroundColor: 'transparent',
    fontFamily: fonts.family,
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': 'scale(0.98)' },
    transitionProperty: 'transform',
    transitionDuration: motion.durationFast,
  },
  footerLead: { color: colors.textSoft },
  // Shipping's path is one unit that never wraps inside; the separator gets twice its 4 px gap.
  footerPath: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: dimensions.space2,
  },
  footerPlace: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space1,
  },
  footerPlaceName: {
    color: colors.text,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
  },
  success: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SUCCESS_GAP_PX,
    padding: dimensions.space6,
    textAlign: 'center',
  },
  minHeight: (height: number) => ({ minHeight: height }),
  badge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: SUCCESS_BADGE_PX,
    height: SUCCESS_BADGE_PX,
    borderRadius: SUCCESS_BADGE_PX / 2,
    backgroundColor: colors.successWash,
  },
});
