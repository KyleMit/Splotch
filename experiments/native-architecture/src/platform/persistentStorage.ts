// A native app's storage is not evicted under storage pressure the way a browser origin's is.
export async function requestPersistentStorage() {
  return false;
}
