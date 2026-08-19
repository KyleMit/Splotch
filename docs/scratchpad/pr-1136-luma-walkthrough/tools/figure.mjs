import sharp from 'sharp';
import { esc } from './lib.mjs';

const BG = '#0d1117', FG = '#e6edf3', DIM = '#8b949e', LINE = '#30363d';

// panels: [{png(Buffer), label, sub}]  laid out in `cols` columns
export async function grid({ title, subtitle, panels, cols, cell = 300, out, gap = 14, groupEvery = 0, groupLabels = [] }) {
  const rows = Math.ceil(panels.length / cols);
  const pad = 24, labelH = 34, titleH = title ? 38 : 0;
  const wrap = (t, max) => { const out = []; let line = ''; for (const word of String(t).split(' ')) { if ((line + ' ' + word).trim().length > max) { out.push(line.trim()); line = word; } else line += ' ' + word; } if (line.trim()) out.push(line.trim()); return out; };
  const rowH = cell + labelH + gap;
  const W = Math.max(pad * 2 + cols * cell + (cols - 1) * gap, title ? Math.ceil(pad * 2 + title.length * 14.5) : 0);
  const subLines = subtitle ? wrap(subtitle, Math.floor((W - pad * 2) / 8.4)) : [];
  const subH = subLines.length * 19;
  const H = pad * 2 + titleH + subH + rows * rowH;
  const parts = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);
  let y = pad;
  if (title) { parts.push(`<text x="${pad}" y="${y + 26}" font-family="ui-monospace,Menlo,monospace" font-size="24" font-weight="700" fill="${FG}">${esc(title)}</text>`); y += 38; }
  subLines.forEach((l, i) => parts.push(`<text x="${pad}" y="${y + 14 + i * 19}" font-family="ui-monospace,Menlo,monospace" font-size="14" fill="${DIM}">${esc(l)}</text>`));
  y += subH;
  if (title) y += 26;

  for (let i = 0; i < panels.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = pad + c * (cell + gap);
    const py = y + r * rowH;
    const p = panels[i];
    if (p.png) {
      const meta = await sharp(p.png).metadata();
      const s = Math.min(cell / meta.width, cell / meta.height);
      const dw = Math.round(meta.width * s), dh = Math.round(meta.height * s);
      const dx = x + Math.round((cell - dw) / 2), dy = py + Math.round((cell - dh) / 2);
      parts.push(`<rect x="${x}" y="${py}" width="${cell}" height="${cell}" fill="#161b22" stroke="${LINE}"/>`);
      parts.push(`<image x="${dx}" y="${dy}" width="${dw}" height="${dh}" href="data:image/png;base64,${p.png.toString('base64')}"/>`);
      if (p.frame) parts.push(`<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="none" stroke="${p.frame}" stroke-width="3"/>`);
    }
    const clip = (s, size) => { const max = Math.floor(cell / (size * 0.6)); return s.length > max ? s.slice(0, max - 1) + '\u2026' : s; };
    parts.push(`<text x="${x}" y="${py + cell + 17}" font-family="ui-monospace,Menlo,monospace" font-size="13" font-weight="600" fill="${p.color || FG}">${esc(clip(p.label || '', 13))}</text>`);
    if (p.sub) parts.push(`<text x="${x}" y="${py + cell + 32}" font-family="ui-monospace,Menlo,monospace" font-size="11.5" fill="${p.subColor || DIM}">${esc(clip(p.sub, 11.5))}</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
  return out;
}
