import { useDeviceReduceMotion, useReduceMotion } from '../drawing/useReduceMotion';
import {
  BUTTON_SCALE_MIN,
  BUTTON_SIZE_HELP,
  BUTTON_SIZE_LABEL,
  DEFAULT_BUTTON_SCALE,
} from '../settings/buttonSize';
import {
  REDUCE_MOTION_HELP,
  REDUCE_MOTION_LABEL,
  reduceMotionChoice,
  type ReduceMotionPreference,
} from '../settings/reduceMotion';
import { RsdSettingCard, RsdSettingGroup } from './RsdSettingCard';
import { RsdSliderRow } from './RsdSlider';
import { RsdToggleRow } from './RsdToggleRow';
import type { SliderDraft } from './useSliderDraft';

// The shipping Accessibility section (AccessibilitySection.svelte, ButtonSizeSetting.svelte):
// Button Size, then the Reduce Motion switch, each with the one sentence on who it helps. While
// Button Size is dragged the dialog turns see-through and only its card stays, so the edge
// controls resize in view behind it.
export function RsdAccessibilitySection({
  buttonScale,
  scaleCeiling,
  busy,
  onReduceMotionChange,
}: {
  buttonScale: SliderDraft;
  scaleCeiling: number;
  busy: boolean;
  onReduceMotionChange: (preference: ReduceMotionPreference) => void;
}) {
  const reduced = useReduceMotion();
  const deviceReduced = useDeviceReduceMotion();
  return (
    <RsdSettingGroup>
      <RsdSettingCard keptSeeThrough>
        <RsdSliderRow
          id="accessibilityButtonScaleLabel"
          label={BUTTON_SIZE_LABEL}
          icon="photo-size-select-small"
          value={Math.min(buttonScale.value, scaleCeiling)}
          min={BUTTON_SCALE_MIN}
          max={scaleCeiling}
          snap={scaleCeiling > DEFAULT_BUTTON_SCALE ? DEFAULT_BUTTON_SCALE : undefined}
          help={BUTTON_SIZE_HELP}
          onInput={buttonScale.onInput}
          onActiveChange={buttonScale.onActiveChange}
        />
      </RsdSettingCard>
      {/* The switch shows the effective answer, so it reads as on when only the device's own
          setting asks for reduced motion. */}
      <RsdSettingCard>
        <RsdToggleRow
          icon="reduce-motion"
          label={REDUCE_MOTION_LABEL}
          id="reduceMotionToggle"
          checked={reduced}
          disabled={busy}
          onToggle={(next) => onReduceMotionChange(reduceMotionChoice(next, deviceReduced))}
          help={REDUCE_MOTION_HELP}
        />
      </RsdSettingCard>
    </RsdSettingGroup>
  );
}
