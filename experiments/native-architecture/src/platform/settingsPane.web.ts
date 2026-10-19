import type { ScrollViewInstance } from 'react-native';
import {
  sectionScrollTop,
  spiedSectionAt,
} from '../../../../web/src/lib/components/settings/paneScroll';
import type { NativeSettingsSectionId } from '../settings/settingsSections';
import type { ScrollExtent } from '../rsdDrawing/RsdScrollCue';

function scrollElement(pane: ScrollViewInstance) {
  const element: unknown = pane.getScrollableNode();
  if (!(element instanceof HTMLElement)) throw new Error('Settings scroll element is unavailable.');
  return element;
}

export function scrollSettingsPaneToSection(
  pane: ScrollViewInstance | null,
  id: NativeSettingsSectionId,
  _offset: number,
  animated: boolean
) {
  if (!pane) return;
  const node = scrollElement(pane);
  const section = node.querySelector(`[data-section="${id}"]`);
  if (!(section instanceof HTMLElement)) throw new Error('Settings section is unavailable.');
  pane.scrollTo({ y: sectionScrollTop(node, section), animated });
}

export function spiedSettingsSection(
  pane: ScrollViewInstance | null,
  ids: readonly NativeSettingsSectionId[],
  _offsets: readonly number[],
  _extent: ScrollExtent
) {
  if (!pane) return ids[0];
  const node = scrollElement(pane);
  const elements: Partial<Record<NativeSettingsSectionId, HTMLElement>> = {};
  for (const id of ids) {
    const section = node.querySelector(`[data-section="${id}"]`);
    if (section instanceof HTMLElement) elements[id] = section;
  }
  return spiedSectionAt(
    node,
    ids.map((id) => ({ id })),
    elements,
    ids.every((id) => elements[id] !== undefined)
  );
}
