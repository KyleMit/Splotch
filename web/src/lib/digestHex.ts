// Lowercase and zero-padded to two digits per byte, because every caller feeds the result into an
// equality comparison against a digest computed elsewhere (a manifest's `sha256` field, a held
// picture's stored signature, a previously derived installation id). A dropped leading zero or an
// uppercase digit is a silent mismatch there, not a crash.
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
