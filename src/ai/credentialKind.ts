import { looksLikeApiKey, looksLikeRetiredGeminiKey } from '../lib/ai/keyFormat';
import type { CredentialKind } from './contract';

// The one Settings field takes an OpenAI key or an access code, told apart as shipping's
// verifyCredential tells them: a key by its prefix, anything else checked as a code. A Google key
// from before the move to OpenAI is named locally and never sent anywhere.
export function classifyCredential(value: string): CredentialKind | 'retiredGeminiKey' {
  if (looksLikeRetiredGeminiKey(value)) return 'retiredGeminiKey';
  return looksLikeApiKey(value) ? 'byok' : 'managed';
}
