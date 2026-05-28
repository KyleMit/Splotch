import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { GoogleGenAI } from '@google/genai';

const ALLOWED_TOKENS = new Set(['kyle', 'parker', 'ryan']);
const ALLOWED_STYLES = new Set(['Watercolor', 'Felted', 'Crayons']);
const MODEL = 'gemini-2.5-flash-image';
const DEFAULT_PROMPT = "Create a cute scene or character based on this child's drawing";

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

  const basePrompt =
    typeof customPrompt === 'string' && customPrompt.trim()
      ? customPrompt.trim()
      : DEFAULT_PROMPT;
  const styleSuffix =
    typeof style === 'string' && ALLOWED_STYLES.has(style)
      ? ` Render it in a ${style} style.`
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
