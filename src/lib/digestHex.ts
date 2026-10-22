// Lowercase and zero-padded to two digits per byte, because every caller feeds the result into an
// equality comparison against a digest computed elsewhere (a manifest's `sha256` field, a held
// picture's stored signature, a previously derived installation id). A dropped leading zero or an
// uppercase digit is a silent mismatch there, not a crash.
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// A picture's content identity for dedupe. A digest the platform cannot compute yields null, which
// no caller treats as a match, so the picture is kept or saved again instead of the failure
// escaping into the save path.
export async function blobSha256OrNull(blob: Blob): Promise<string | null> {
  try {
    return await sha256Hex(await blob.arrayBuffer());
  } catch {
    return null;
  }
}
