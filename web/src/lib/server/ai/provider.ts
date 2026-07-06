// Provider-agnostic boundary for the AI image features (ADR-0047). Routes talk
// to this interface — an assembled prompt + drawing in; an image, a safety
// refusal, or an upstream error out — so an image-model deprecation or vendor
// swap is contained to the adapter behind it. Nothing outside lib/server/ai/
// may import the vendor SDK.

export interface AiImageRequest {
  /** Vendor API key: the server's managed key or the parent's BYO key. */
  apiKey: string;
  image: { base64: string; mimeType: string };
  prompt: string;
}

export type AiImageResult =
  /** Generated image bytes, base64-encoded. */
  | { kind: 'image'; data: string; mimeType: string }
  /** Declined on safety grounds — the child should draw something else (422). */
  | { kind: 'refusal'; reason: string }
  /** Genuine upstream/empty failure — retryable (502). */
  | { kind: 'error'; reason: string };

export type KeyCheckResult = { ok: true } | { ok: false; reason: string };

export interface AiImageProvider {
  generateImage(request: AiImageRequest): Promise<AiImageResult>;
  verifyKey(apiKey: string): Promise<KeyCheckResult>;
}

export { geminiProvider as aiProvider } from './gemini';
