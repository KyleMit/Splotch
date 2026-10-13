import { SAVE_ON_DELETE_HELP, SAVE_ON_DELETE_LABEL } from '../settings/saveOnDelete';
import { CAMERA_BUTTON_HELP, CAMERA_BUTTON_LABEL } from '../settings/savingSection';
import { RsdSettingCard, RsdSettingGroup, RsdSettingSectionBody } from './RsdSettingCard';
import { RsdToggleRow } from './RsdToggleRow';

// The shipping Settings › Saving section (settings/SavingSection.svelte): the Camera button switch,
// the deliberate save, then Auto-Save on Delete. Shipping's "Save drawings to" folder row needs the
// File System Access API and appears only on desktop Chromium; the app saves to the photo library
// on a device and downloads on the web, so it has no folder to choose.
export function RsdSavingSection({
  screenshotEnabled,
  saveOnDeleteEnabled,
  busy,
  onScreenshotChange,
  onSaveOnDeleteChange,
}: {
  screenshotEnabled: boolean;
  saveOnDeleteEnabled: boolean;
  busy: boolean;
  onScreenshotChange: (enabled: boolean) => void;
  onSaveOnDeleteChange: (enabled: boolean) => void;
}) {
  return (
    <RsdSettingSectionBody>
      <RsdSettingGroup>
        <RsdSettingCard>
          <RsdToggleRow
            icon="camera"
            label={CAMERA_BUTTON_LABEL}
            id="screenshotToggle"
            checked={screenshotEnabled}
            disabled={busy}
            help={CAMERA_BUTTON_HELP}
            onToggle={onScreenshotChange}
          />
        </RsdSettingCard>
        <RsdSettingCard>
          <RsdToggleRow
            icon="camera-party"
            label={SAVE_ON_DELETE_LABEL}
            id="saveOnDeleteToggle"
            checked={saveOnDeleteEnabled}
            disabled={busy}
            help={SAVE_ON_DELETE_HELP}
            onToggle={onSaveOnDeleteChange}
          />
        </RsdSettingCard>
      </RsdSettingGroup>
    </RsdSettingSectionBody>
  );
}
