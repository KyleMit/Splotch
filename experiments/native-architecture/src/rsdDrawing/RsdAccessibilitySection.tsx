import { html } from 'react-strict-dom';
import { RsdAction, styles } from './controls';
import { useDeviceReduceMotion, useReduceMotion } from '../drawing/useReduceMotion';
import {
  BUTTON_SCALE_MAX,
  BUTTON_SCALE_MIN,
  BUTTON_SIZE_HELP,
  BUTTON_SIZE_LABEL,
  stepButtonScale,
} from '../settings/buttonSize';
import {
  REDUCE_MOTION_HELP,
  REDUCE_MOTION_LABEL,
  reduceMotionChoice,
  type ReduceMotionPreference,
} from '../settings/reduceMotion';

// The shipping Accessibility section (AccessibilitySection.svelte): Button Size, then the
// Reduce Motion switch, each with the one sentence on who it helps.
export function RsdAccessibilitySection({
  buttonScale,
  busy,
  onButtonScaleChange,
  onReduceMotionChange,
}: {
  buttonScale: number;
  busy: boolean;
  onButtonScaleChange: (scale: number) => void;
  onReduceMotionChange: (preference: ReduceMotionPreference) => void;
}) {
  const reduced = useReduceMotion();
  const deviceReduced = useDeviceReduceMotion();
  return (
    <html.div style={styles.stack}>
      <html.div role="group" aria-label={BUTTON_SIZE_LABEL} style={styles.stack}>
        <html.span>{`${BUTTON_SIZE_LABEL} ${buttonScale}%`}</html.span>
        <html.div style={styles.row}>
          <RsdAction
            label="Smaller buttons"
            text="Smaller"
            disabled={busy || buttonScale <= BUTTON_SCALE_MIN}
            onClick={() => onButtonScaleChange(stepButtonScale(buttonScale, -1))}
          />
          <RsdAction
            label="Bigger buttons"
            text="Bigger"
            disabled={busy || buttonScale >= BUTTON_SCALE_MAX}
            onClick={() => onButtonScaleChange(stepButtonScale(buttonScale, 1))}
          />
        </html.div>
        <html.span>{BUTTON_SIZE_HELP}</html.span>
      </html.div>
      {/* The switch shows the effective answer, so it reads as on when only the device's own
          setting asks for reduced motion. */}
      <RsdAction
        label={REDUCE_MOTION_LABEL}
        selection="switch"
        selected={reduced}
        disabled={busy}
        onClick={() => onReduceMotionChange(reduceMotionChoice(!reduced, deviceReduced))}
      />
      <html.span>{REDUCE_MOTION_HELP}</html.span>
    </html.div>
  );
}
