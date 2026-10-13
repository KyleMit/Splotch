import { html } from 'react-strict-dom';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { RsdAction, styles } from './controls';
import {
  PARENT_FEATURES,
  PARENT_LABELS,
  PARENT_MODES,
  PARENT_MODE_LABELS,
} from '../parentCenter/parentPolicy';
import type { DrawingProductOwner } from '../product/createDrawingProduct';

const PARENT_CENTER_TITLE = 'Parent Center';

export function RsdParentCenterSection({
  owner,
  visible,
  onDismiss,
}: {
  owner: DrawingProductOwner;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const state = owner.getState();
  const settings = state.settings;
  if (!settings) return null;
  const disabled = !owner.settings.canEditParent();
  return (
    <ModalShell
      visible={visible ?? state.parentCenterOpen}
      onDismiss={onDismiss}
      label={PARENT_CENTER_TITLE}
      size="sheet"
      onClose={owner.closeParentCenter}
      header={
        <DialogHeader
          title={PARENT_CENTER_TITLE}
          titleSize="xl"
          onClose={owner.closeParentCenter}
        />
      }
    >
      <html.div style={styles.dialogContent}>
        <html.span>
          AI picture creation sends a copy of a drawing to the hosted image service only when you
          choose Send. AI starts off. Turning it off keeps saved pictures and credentials.
        </html.span>
        <RsdAction
          label="AI picture creation"
          selection="switch"
          selected={settings.aiEnabled}
          disabled={disabled}
          onClick={() => {
            void owner.setAiEnabled(!settings.aiEnabled);
          }}
        />
        {PARENT_FEATURES.map((feature) => (
          <html.div
            key={feature}
            role="radiogroup"
            aria-label={PARENT_LABELS[feature]}
            style={styles.stack}
          >
            <html.span>{PARENT_LABELS[feature]}</html.span>
            <html.div style={styles.row}>
              {PARENT_MODES.map((mode) => (
                <RsdAction
                  key={mode}
                  label={`${PARENT_MODE_LABELS[mode]}: ${PARENT_LABELS[feature]}`}
                  text={PARENT_MODE_LABELS[mode]}
                  selection="radio"
                  selected={settings.parentPolicies[feature] === mode}
                  disabled={disabled}
                  onClick={() => {
                    void owner.setPolicy(feature, mode);
                  }}
                />
              ))}
            </html.div>
          </html.div>
        ))}
        {state.confirmNever ? (
          <html.div style={styles.stack}>
            <html.span>
              Never lets anyone open Parent Center and change these choices without a check on this
              device.
            </html.span>
            <RsdAction
              label="Confirm Parent Center Never"
              onClick={() => {
                void owner.setPolicy('parentCenter', 'never', true);
              }}
            />
            <RsdAction label="Keep current Parent Center protection" onClick={owner.cancelNever} />
          </html.div>
        ) : null}
        <html.span aria-live="polite">{settings.message}</html.span>
        {settings.status === 'saving' ? <html.span>Saving Parent Center choices…</html.span> : null}
        {settings.status === 'ready' && !settings.saved ? (
          <>
            <RsdAction
              label="Retry saving Parent Center choices"
              onClick={() => {
                void owner.retryParentSave();
              }}
            />
            <RsdAction
              label="Read saved settings again"
              onClick={() => {
                void owner.settings.retryRead();
              }}
            />
          </>
        ) : null}
      </html.div>
    </ModalShell>
  );
}
