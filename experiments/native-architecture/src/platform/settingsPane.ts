import type { ScrollView } from 'react-native';
import type { NativeSettingsSectionId } from '../settings/settingsSections';
import { spiedSectionAt } from '../settings/settingsPane';
import type { ScrollExtent } from '../rsdDrawing/RsdScrollCue';

export function scrollSettingsPaneToSection(
  pane: ScrollView | null,
  _id: NativeSettingsSectionId,
  offset: number,
  animated: boolean
) {
  pane?.scrollTo({ y: offset, animated });
}

export function spiedSettingsSection(
  _pane: ScrollView | null,
  ids: readonly NativeSettingsSectionId[],
  offsets: readonly number[],
  extent: ScrollExtent
) {
  return spiedSectionAt(ids, offsets, extent);
}
