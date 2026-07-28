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

export function verifyKeyBucket(address: string): string {
  return `verify-key:${address}`;
}

export function reportBucket(address: string): string {
  return `report:${address}`;
}

export function cspReportBucket(address: string): string {
  return `csp-report:${address}`;
}
