// A browser cannot observe Guided Access or App Pinning, so the web export never reports a lock.
export async function isDeviceLocked(): Promise<boolean> {
  return false;
}
