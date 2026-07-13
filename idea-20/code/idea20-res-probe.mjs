// Idea 20 probe (temporary — delete after the run): does the pipeline's image
// model support higher output resolution via imageConfig.imageSize?
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.argv[2] || 'gemini-2.5-flash-image';
const imageSize = process.argv[3] || '2K';

try {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'A single plain blue circle centered on a white background, minimal line drawing.',
          },
        ],
      },
    ],
    config: {
      abortSignal: AbortSignal.timeout(120_000),
      imageConfig: { aspectRatio: '3:2', imageSize },
    },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData);
  if (!img) {
    console.log('no image part; parts:', JSON.stringify(parts.map((p) => Object.keys(p))));
    process.exit(0);
  }
  const meta = await sharp(Buffer.from(img.inlineData.data, 'base64')).metadata();
  console.log(
    `${model} imageSize=${imageSize} ->`,
    meta.width,
    'x',
    meta.height,
    img.inlineData.mimeType
  );
} catch (err) {
  console.log(`${model} imageSize=${imageSize} -> ERROR:`, err.message?.slice(0, 400));
}
