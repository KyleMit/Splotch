import { GoogleGenAI } from '@google/genai';
import { fail } from './paths.mjs';

export function makeClient({ optional = false } = {}) {
  if (!process.env.GEMINI_API_KEY) {
    if (optional) return null;
    fail('GEMINI_API_KEY is not set.');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}
