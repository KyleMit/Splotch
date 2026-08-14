import { GoogleGenAI } from '@google/genai';
import { fail } from './asset-cli.mjs';
import { classifyGeminiResponse } from './gemini-response.ts';

export const IMAGE_MODEL = 'gemini-3.1-flash-image';
export const IMAGE_TIMEOUT_MS = 120_000;

export function makeClient({ optional = false } = {}) {
  if (!process.env.GEMINI_API_KEY) {
    if (optional) return null;
    fail('GEMINI_API_KEY is not set.');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function generateImage(
  ai,
  { imageBytes, mimeType, prompt, temperature, aspectRatio }
) {
  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          ...(imageBytes === undefined
            ? []
            : [
                {
                  inlineData: {
                    mimeType,
                    data: Buffer.from(imageBytes).toString('base64'),
                  },
                },
              ]),
          { text: prompt },
        ],
      },
    ],
    config: {
      abortSignal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      ...(temperature === undefined ? {} : { temperature }),
      ...(aspectRatio === undefined ? {} : { imageConfig: { aspectRatio } }),
    },
  });
  const classified = classifyGeminiResponse(response);
  if (classified.kind !== 'image') {
    throw new Error(`${classified.kind}: ${classified.reason}`);
  }
  return { bytes: Buffer.from(classified.data, 'base64'), mimeType: classified.mimeType };
}
