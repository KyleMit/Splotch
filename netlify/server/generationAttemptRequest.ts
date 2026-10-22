import { error } from './http';
import sharp from 'sharp';
import {
  ACCESS_TOKEN_HEADER,
  API_KEY_HEADER,
  INSTALLATION_ID_HEADER,
} from '../../src/lib/apiHeaders';
import { GENERATION_STYLE_PARAM } from '../../src/lib/apiParams';
import { isInstallationId } from '../../src/lib/installationId';
import { RecoveryFault, type RecoveryMime } from '../../src/lib/ai/generationAttempt';
import {
  RECOVERY_MAX_CREDENTIAL_BYTES,
  RECOVERY_MAX_INPUT_PIXELS,
} from './generationAttemptPolicy';
export type RecoveryCredential = Readonly<{ kind: 'byok' | 'managed' | 'free'; identity: string }>;
export function recoveryCredential(headers: Headers): RecoveryCredential {
  const credentials = [
    { kind: 'byok', value: headers.get(API_KEY_HEADER) },
    { kind: 'managed', value: headers.get(ACCESS_TOKEN_HEADER) },
    { kind: 'free', value: headers.get(INSTALLATION_ID_HEADER) },
  ] as const;
  const supplied = credentials.filter(({ value }) => value !== null);
  if (supplied.length !== 1) throw new RecoveryFault('RECOVERY_INVALID');
  const credential = supplied[0];
  const identity = credential.value;
  if (
    !identity ||
    identity !== identity.trim() ||
    /[,\r\n]/.test(identity) ||
    Buffer.byteLength(identity) > RECOVERY_MAX_CREDENTIAL_BYTES ||
    (credential.kind === 'free' && !isInstallationId(identity))
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  return { kind: credential.kind, identity };
}
export function recoveryStyleQuery(url: URL): string {
  if (
    [...url.searchParams.keys()].some((key) => key !== GENERATION_STYLE_PARAM) ||
    url.searchParams.getAll(GENERATION_STYLE_PARAM).length !== 1
  )
    throw new RecoveryFault('RECOVERY_INVALID');
  return url.searchParams.get(GENERATION_STYLE_PARAM) ?? '';
}
export function requireRecoveryNoQuery(url: URL): void {
  if (url.search) throw new RecoveryFault('RECOVERY_INVALID');
}
const IMAGE_FORMATS: Record<RecoveryMime, 'png' | 'jpeg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
};
export async function validateRecoveryInput(bytes: Uint8Array, mime: RecoveryMime): Promise<void> {
  try {
    const image = sharp(bytes, { limitInputPixels: RECOVERY_MAX_INPUT_PIXELS, failOn: 'error' });
    const metadata = await image.metadata();
    if (
      metadata.format !== IMAGE_FORMATS[mime] ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > RECOVERY_MAX_INPUT_PIXELS
    )
      throw new Error('Image format is invalid');
    await image.stats();
  } catch {
    throw error(400, 'That drawing could not be read');
  }
}
