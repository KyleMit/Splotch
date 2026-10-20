// The native apps never kept AI credentials in plaintext, and the shipping Capacitor WebView's
// storage is out of their reach, so only the web build has legacy keys to remove
// (legacyAiCredentials.web.ts).
export function removeLegacyAiCredentials() {}
