import { File, Paths } from 'expo-file-system';
import { createSettingsSessions } from '../settings/settingsSessions';

const SESSION_COUNT_FILE = 'splotch-settings-activity-sessions.txt';

function countFile() {
  return new File(Paths.document, SESSION_COUNT_FILE);
}

export const settingsSessions = createSettingsSessions({
  async read() {
    const file = countFile();
    return file.exists ? file.text() : null;
  },
  async write(count) {
    const file = countFile();
    if (!file.exists) file.create();
    await file.write(count);
  },
});
