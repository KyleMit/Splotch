import { css, html } from 'react-strict-dom';
import { Animated } from 'react-native';
import { ModalShell } from './ModalShell';
import { DialogHeader, useDialogTitleId } from './DialogHeader';
import { RsdAction, styles } from './controls';
import { RsdParentGateKeypad } from './RsdParentGateKeypad';
import { colors, dimensions, fonts } from './tokens.css';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { PARENT_LABELS } from '../parentCenter/parentPolicy';
import type { ParentGateState } from '../parentCenter/parentGate';
import type { DrawingProductOwner } from '../product/createDrawingProduct';
import { useParentGateMotion } from '../parentCenter/useParentGateMotion';

// The shipping answer dab (ParentalGateProblem.svelte): one per answer digit, its dashed edge the
// only hint of how many digits the answer has until it fills.
const DAB_WIDTH_PX = 48;
const DAB_HEIGHT_PX = 54;
const DAB_EDGE_PX = 2;
const GATE_TITLE = 'Grown-ups only';

const sheetStyles = css.create({
  problem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dimensions.space2,
    fontSize: dimensions.fontSizeLg,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    color: colors.textStrong,
  },
  dab: (edge: string) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: DAB_WIDTH_PX,
    height: DAB_HEIGHT_PX,
    borderRadius: dimensions.radiusMd,
    borderWidth: DAB_EDGE_PX,
    borderStyle: 'dashed',
    borderColor: edge,
  }),
  filled: { borderColor: 'transparent', backgroundColor: colors.brandWash },
});

function answerDabs(state: ParentGateState) {
  return Array.from(
    { length: String(state.x * state.y).length },
    (_, index) => state.input[index] ?? ''
  );
}

export function RsdParentGateSheet({
  owner,
  state,
  visible = state.open,
  onDismiss,
}: {
  owner: DrawingProductOwner;
  state: ParentGateState;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const offset = useParentGateMotion(state);
  const { iconMuted } = useDrawingTheme();
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
      label={GATE_TITLE}
      size="gate"
      onClose={owner.gate.dismiss}
      header={<DialogHeader onClose={owner.gate.dismiss} />}
    >
      <Animated.View style={{ transform: [{ translateX: offset }] }}>
        <html.div style={styles.dialogContent}>
          <GateTitle />
          <html.span>{PARENT_LABELS[state.feature]}</html.span>
          <html.div style={sheetStyles.problem}>
            <html.span>
              {state.x} × {state.y} =
            </html.span>
            {answerDabs(state).map((digit, index) => (
              <html.div
                key={index}
                aria-hidden
                style={[sheetStyles.dab(iconMuted), digit !== '' && sheetStyles.filled]}
              >
                <html.span>{digit}</html.span>
              </html.div>
            ))}
          </html.div>
          <html.span aria-hidden>{state.message}</html.span>
          <html.span key={state.announcementId} aria-live="polite">
            {state.announcement}
          </html.span>
          <RsdParentGateKeypad locked={state.locked} onPress={owner.gate.press} />
          {state.feature !== 'parentCenter' ? (
            <RsdAction
              label="Manage these checks in Settings › Parent Center"
              onClick={owner.retargetParentCenter}
            />
          ) : null}
        </html.div>
      </Animated.View>
    </ModalShell>
  );
}

function GateTitle() {
  return (
    <html.h1 id={useDialogTitleId()} style={styles.boldText}>
      {GATE_TITLE}
    </html.h1>
  );
}
