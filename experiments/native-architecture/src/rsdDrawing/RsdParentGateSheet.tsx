import { html } from 'react-strict-dom';
import { Animated } from 'react-native';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';
import { PARENT_LABELS } from '../parentCenter/parentPolicy';
import type { ParentGateState } from '../parentCenter/parentGate';
import type { DrawingProductOwner } from '../product/createDrawingProduct';
import { useParentGateMotion } from '../parentCenter/useParentGateMotion';

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
  const disabled = state.locked || state.shaking;
  const offset = useParentGateMotion(state);
  return (
    <NativeDialog
      visible={visible}
      onDismiss={onDismiss}
      label="Grown-ups only"
      onClose={owner.gate.dismiss}
      footer={<RsdAction label="Cancel challenge" onClick={owner.gate.dismiss} />}
    >
      <Animated.View style={{ transform: [{ translateX: offset }] }}>
        <html.div style={styles.dialogContent}>
          <html.h1>Grown-ups only</html.h1>
          <html.span>{PARENT_LABELS[state.feature]}</html.span>
          <html.span>
            {state.x} × {state.y}
          </html.span>
          <html.input
            aria-label="Grown-up answer"
            inputMode="numeric"
            value={state.input}
            disabled={disabled}
            onChange={(event: unknown) => {
              if (
                event &&
                typeof event === 'object' &&
                'target' in event &&
                event.target &&
                typeof event.target === 'object' &&
                'value' in event.target &&
                typeof event.target.value === 'string'
              )
                owner.gate.input(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') owner.gate.answer();
            }}
          />
          <html.span aria-hidden>{state.message}</html.span>
          <html.span key={state.announcementId} aria-live="polite">
            {state.announcement}
          </html.span>
          <RsdAction label="Check answer" disabled={disabled} onClick={owner.gate.answer} />
          {state.feature !== 'parentCenter' ? (
            <RsdAction
              label="Manage these checks in Settings › Parent Center"
              onClick={owner.retargetParentCenter}
            />
          ) : null}
        </html.div>
      </Animated.View>
    </NativeDialog>
  );
}
