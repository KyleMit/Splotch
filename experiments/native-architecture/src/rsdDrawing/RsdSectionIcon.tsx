import { RsdIcon } from './RsdIcon';
import { RsdSplotchyIcon } from './RsdSplotchyIcon';
import { SPLOTCHY_ICON_NAME, type NativeIconName } from './icons.generated';

type SectionIconName = NativeIconName | typeof SPLOTCHY_ICON_NAME;

// The shipping SectionIcon.svelte: a settings section names any icon, and Splotchy routes to its
// structural component instead of the icon registry.
export function RsdSectionIcon({
  icon,
  size,
  ink,
}: {
  icon: SectionIconName;
  size: number;
  ink: string | undefined;
}) {
  return icon === SPLOTCHY_ICON_NAME ? (
    <RsdSplotchyIcon size={size} />
  ) : (
    <RsdIcon name={icon} size={size} ink={ink} muted={false} />
  );
}
