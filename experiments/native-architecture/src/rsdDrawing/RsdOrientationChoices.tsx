import { html } from 'react-strict-dom';
import { autoOverridesSystemLock, useOrientationLockApplies } from '../platform/deviceOrientation';
import {
  AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE,
  ORIENTATION_CHOICES,
  ORIENTATION_LABELS,
  type OrientationChoice,
} from '../settings/orientation';
import { RsdAction, styles as controlStyles } from './controls';

// Rendered only where a lock would be honored: a control that cannot turn the
// screen is worse than no control (docs/ORIENTATION.md).
export function RsdOrientationChoices({
  selected,
  busy,
  onChange,
}: {
  selected: OrientationChoice;
  busy: boolean;
  onChange: (orientation: OrientationChoice) => void;
}) {
  if (!useOrientationLockApplies()) return null;
  return (
    <>
      <html.span>Orientation</html.span>
      <html.div role="radiogroup" aria-label="Orientation" style={controlStyles.row}>
        {ORIENTATION_CHOICES.map((orientation) => (
          <RsdAction
            key={orientation}
            label={`${ORIENTATION_LABELS[orientation]} orientation`}
            text={ORIENTATION_LABELS[orientation]}
            selection="radio"
            selected={selected === orientation}
            disabled={busy}
            onClick={() => onChange(orientation)}
          />
        ))}
      </html.div>
      {autoOverridesSystemLock() ? null : (
        <html.span>{AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE}</html.span>
      )}
    </>
  );
}
