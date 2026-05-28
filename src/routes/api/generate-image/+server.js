import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { GoogleGenAI } from '@google/genai';

const rawTokens = env.ALLOWED_TOKENS_LIST || '';
const tokenArray = rawTokens.split(',').map(t => t.trim());
const ALLOWED_TOKENS = new Set(tokenArray);

const MODEL = 'gemini-2.5-flash-image';
const DEFAULT_PROMPT =
  "Reimagine this child's drawing as a polished, magical illustration. Keep the original characters, shapes, and composition intact, but bring them to life with vibrant color, charming details, and a warm, whimsical feel.";

const STYLE_SUFFIXES = {
  Watercolor: 'Render the final image as a soft watercolor painting with gentle washes and bleeding edges.',
  Crayon: 'Render the final image as a vibrant crayon drawing on lightly textured paper.',
  'Felt Craft': 'Render the final image as a handmade felt craft scene, with fuzzy 3D fabric textures.',
  Claymation: 'Render the final image as a claymation scene with sculpted clay characters on a tabletop set.',
  Storybook: "Render the final image in the style of a classic children's storybook illustration."
};

export async function POST({ request }) {
  const form = await request.formData();
  const token = form.get('token');
  const imageFile = form.get('image');
  const customPrompt = form.get('prompt');
  const style = form.get('style');

  if (typeof token !== 'string' || !ALLOWED_TOKENS.has(token)) {
    throw error(403, 'Invalid access token');
  }
  if (!(imageFile instanceof Blob)) {
    throw error(400, 'Missing image');
  }
  if (!env.GEMINI_API_KEY) {
    throw error(500, 'Server is missing GEMINI_API_KEY');
  }

  const rawBase =
    typeof customPrompt === 'string' && customPrompt.trim()
      ? customPrompt.trim()
      : DEFAULT_PROMPT;
  const basePrompt = /[.!?]$/.test(rawBase) ? rawBase : rawBase + '.';
  const styleSuffix =
    typeof style === 'string' && Object.hasOwn(STYLE_SUFFIXES, style)
      ? ' ' + STYLE_SUFFIXES[style]
      : '';
  const finalPrompt = basePrompt + styleSuffix;

  const inputBytes = new Uint8Array(await imageFile.arrayBuffer());
  const inputBase64 = Buffer.from(inputBytes).toString('base64');

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: imageFile.type || 'image/png', data: inputBase64 } },
            { text: finalPrompt }
          ]
        }
      ]
    });
  } catch (err) {
    console.error('Gemini call failed:', err);
    throw error(502, `Gemini request failed: ${err?.message ?? String(err)}`);
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    const textPart = parts.find((p) => typeof p.text === 'string');
    const reason = textPart?.text || response?.candidates?.[0]?.finishReason || 'no image part returned';
    throw error(502, `Model did not return an image: ${reason}`);
  }

  const outBytes = Buffer.from(imagePart.inlineData.data, 'base64');
  return new Response(outBytes, {
    headers: {
      'Content-Type': imagePart.inlineData.mimeType || 'image/png',
      'Cache-Control': 'no-store'
    }
  });
}
