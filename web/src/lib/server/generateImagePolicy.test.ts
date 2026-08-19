// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isAllowedImageType,
  resolveGenerationPrompt,
  resolveGenerationStyle,
} from './generateImagePolicy';

describe('generate image policy', () => {
  it('accepts the image formats shared by generation and reporting', () => {
    expect(isAllowedImageType('image/png')).toBe(true);
    expect(isAllowedImageType('image/jpeg')).toBe(true);
    expect(isAllowedImageType('image/webp')).toBe(true);
    expect(isAllowedImageType('image/gif')).toBe(false);
  });

  it('resolves the server-owned generation prompt', () => {
    expect(resolveGenerationPrompt('Felt')).toContain('handmade felt craft scene');
    expect(resolveGenerationPrompt(null)).not.toContain('cozy night-time version');
  });

  it('closes usage and worker style values over the configured style categories', () => {
    expect(resolveGenerationStyle('Felt')).toBe('Felt');
    expect(resolveGenerationStyle('free-form user text')).toBeNull();
    expect(resolveGenerationStyle(null)).toBeNull();
  });
});
