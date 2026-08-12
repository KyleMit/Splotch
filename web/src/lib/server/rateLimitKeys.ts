// Both admin front doors (the form action and the JSON endpoint) throttle into
// this one bucket so an attacker can't double their guessing budget by
// alternating between them.
export function adminLoginBucket(address: string): string {
  return `admin-login:${address}`;
}

export function verifyAccessCodeBucket(address: string): string {
  return `verify-access-code:${address}`;
}

export function generateImageBucket(token: string): string {
  return `generate-image:${token}`;
}

export function generateImageByokBucket(address: string): string {
  return `generate-image-byok:${address}`;
}

export function generateImageFreeBucket(address: string): string {
  return `generate-image-free:${address}`;
}

export function freeGenerationGrantStatusBucket(address: string): string {
  return `free-generation-grant-status:${address}`;
}

export function verifyKeyBucket(address: string): string {
  return `verify-key:${address}`;
}

export function reportBucket(address: string): string {
  return `report:${address}`;
}

export function reportImageTokenBucket(token: string): string {
  return `report-image-token:${token}`;
}

export function reportImageByokBucket(address: string): string {
  return `report-image-byok:${address}`;
}

export function reportImageFreeBucket(address: string): string {
  return `report-image-free:${address}`;
}

export function cspReportBucket(address: string): string {
  return `csp-report:${address}`;
}
