// The toddler session: perf:web, perf:web:webkit, perf:android.
import { defineScenario, type PathGenerator } from 'perf-rig';

const BRAND = ['#EC534E', '#F89C45', '#F9D24F', '#8CC864', '#62A2E9', '#AB71E1'] as const;

const zigzag: PathGenerator = (b) =>
  Array.from({ length: 24 }, (_, i) => ({
    x: b.x + (b.width * i) / 23,
    y: b.y + b.height * (i % 2 ? 0.3 : 0.7),
  }));
const circle: PathGenerator = (b) =>
  Array.from({ length: 36 }, (_, i) => ({
    x: b.x + b.width / 2 + Math.cos((i / 36) * Math.PI * 2) * b.width * 0.3,
    y: b.y + b.height / 2 + Math.sin((i / 36) * Math.PI * 2) * b.height * 0.3,
  }));

export const toddlerSession = defineScenario({
  kind: 'session',
  id: 'toddler-session',
  description:
    'Multi-finger draw, color and size changes, erase, undo, clear, under a Chrome trace where available.',
  trace: true,
  beats: [
    {
      label: 'boot-settle',
      steps: [{ kind: 'settle', ms: 400, reason: 'first paint and font load' }],
    },
    { label: 'draw-single', steps: [{ kind: 'stroke', path: zigzag }] },
    { label: 'multi-finger-draw', steps: [{ kind: 'stroke', path: circle, pointers: 3 }] },
    {
      label: 'change-colors',
      steps: BRAND.map((hex) => ({
        kind: 'click' as const,
        target: `.color-swatch[data-color="${hex}"]`,
      })),
    },
    {
      label: 'stroke-size',
      steps: [
        { kind: 'click', target: '#strokeWidthButton' },
        { kind: 'click', target: 'button[aria-label="Size 5"]' },
        { kind: 'stroke', path: zigzag },
      ],
    },
    {
      label: 'erase',
      steps: [
        { kind: 'click', target: '#brushButton' },
        { kind: 'click', target: '#eraserButton' },
        { kind: 'stroke', path: circle },
      ],
    },
    {
      label: 'undo',
      steps: [
        { kind: 'click', target: '#undoButton' },
        { kind: 'click', target: '#undoButton' },
      ],
    },
    { label: 'clear', steps: [{ kind: 'dragBeyond', control: 'clear', fraction: 0.48 }] },
  ],
});
