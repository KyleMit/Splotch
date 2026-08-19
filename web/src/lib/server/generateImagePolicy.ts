import { buildPromptForStyle } from '../ai/prompt.ts';
import { STYLE_SUFFIXES, type StyleName } from '../ai/styles.ts';

// A drawing screenshot is well under a megabyte; cap the upload so a valid-token
// holder can't push us into a memory/DoS situation by base64-ing a huge blob.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function isAllowedImageType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.some((allowedType) => allowedType === mimeType);
}

export function resolveGenerationStyle(style: string | null): StyleName | null {
  return style !== null && Object.hasOwn(STYLE_SUFFIXES, style) ? (style as StyleName) : null;
}

export function resolveGenerationPrompt(style: StyleName | null): string {
  // The generation request carries no theme. Owning the product-level light pin
  // here keeps retained report evidence identical to the prompt sent upstream.
  return buildPromptForStyle(style, STYLE_SUFFIXES, 'light');
}
