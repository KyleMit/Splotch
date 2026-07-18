import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'node:fs';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash-image';

const prompts = [
  [
    'single',
    'A single thick crayon stroke drawn diagonally across white paper, photographed straight-on, macro. Waxy pigment with visible paper-tooth texture: color is dense in the core and breaks up at the edges where the wax skips over the low points of the paper grain. Slightly uneven pressure. No background, no text, just the stroke on white paper.',
  ],
  [
    'overlap',
    'Two overlapping crayon strokes of the SAME color on white paper, macro photo. Where the two strokes cross, the wax builds up and the paper-tooth gaps get filled in, so the overlap is noticeably more saturated and solid than either single stroke — but the hue is the same, just denser. Show how a second pass fills the white speckles left by the first pass.',
  ],
  [
    'scribble',
    'A childs crayon scribble on white paper, macro photo, one solid color. Back-and-forth strokes with waxy grainy texture, edges that feather softly following the paper grain, no hard outline. Areas gone over twice are darker and more filled-in.',
  ],
];

for (const [name, prompt] of prompts) {
  try {
    const r = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });
    const parts = r.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData?.data);
    if (!img) {
      console.log(name, 'NO IMAGE', JSON.stringify(parts).slice(0, 150));
      continue;
    }
    const buf = Buffer.from(img.inlineData.data, 'base64');
    const ext = (img.inlineData.mimeType || 'image/png').split('/')[1];
    writeFileSync(new URL(`./out/ref-${name}.${ext}`, import.meta.url), buf);
    console.log(name, 'OK', buf.length, 'bytes', img.inlineData.mimeType);
  } catch (e) {
    console.log(name, 'ERR', e?.status || '', String(e?.message || e).slice(0, 160));
  }
}
