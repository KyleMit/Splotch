import { Linking } from 'react-native';

// This app's page in the device's Settings, where a parent turns the photo library permission
// back on; the shipping AppSettings plugin opens the same page.
export function openAppSettings() {
  Linking.openSettings().catch((error: unknown) =>
    console.error('Opening app settings failed:', error)
  );
}
