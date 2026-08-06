// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { themes } from '../design/tokens';

// Catches the eraser-size icons' inline var(...,#hex) fallbacks drifting from
// themes.light — nothing else notices since the CSS var always resolves in-app.
const svgs = import.meta.glob<string>('./*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('icon token fallbacks match themes.light', () => {
  it.each(Object.entries(svgs))('%s', (_path, src) => {
    const paperMatch = src.match(/var\(--paper,(#[0-9a-fA-F]{3,8})\)/);
    if (paperMatch) expect(paperMatch[1]).toBe(themes.light.paper);
    const holeMatch = src.match(/var\(--hole-stroke,(#[0-9a-fA-F]{3,8})\)/);
    if (holeMatch) expect(holeMatch[1]).toBe(themes.light.holeStroke);
  });
});
