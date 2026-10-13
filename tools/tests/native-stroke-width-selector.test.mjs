import {
  STROKE_WIDTHS,
  STROKE_WIDTH_LABELS,
} from '../../experiments/native-architecture/src/drawing/strokeWidth.ts';
// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StrokeWidthSelector } from '../../experiments/native-architecture/src/drawing/StrokeWidthSelector.tsx';

vi.mock('react-native', () => import('react-native-web'));

function controls(tool, selected, disabled = false) {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    createElement(StrokeWidthSelector, { tool, selected, disabled, onChange() {} })
  );
  return Array.from(root.querySelectorAll('[role="button"]'));
}

describe('Stroke Width Selector through installed React Native Web', () => {
  it.each(['drawing', 'eraser'])(
    'exposes exactly the selected %s width as a toggle button for every choice',
    (tool) => {
      for (const selected of STROKE_WIDTHS) {
        const rendered = controls(tool, selected);
        expect(rendered).toHaveLength(5);
        expect(rendered.map((element) => element.getAttribute('aria-pressed'))).toEqual(
          STROKE_WIDTHS.map((width) => String(width === selected))
        );
        const active = rendered.find((element) => element.getAttribute('aria-pressed') === 'true');
        expect(active.getAttribute('aria-label')).toBe(
          `${tool === 'eraser' ? 'Eraser' : 'Drawing'} width: ${STROKE_WIDTH_LABELS[selected]}`
        );
        expect(active.textContent).toContain('✓');
        expect(rendered.filter((element) => element.textContent.includes('✓'))).toHaveLength(1);
      }
    }
  );

  it('retains selected semantics while the actual Pressable blocks input', () => {
    const rendered = controls('eraser', 'thick', true);
    expect(rendered).toHaveLength(5);
    expect(rendered.map((element) => element.getAttribute('aria-disabled'))).toEqual(
      STROKE_WIDTHS.map(() => 'true')
    );
    expect(rendered.map((element) => element.getAttribute('aria-pressed'))).toEqual(
      STROKE_WIDTHS.map((width) => String(width === 'thick'))
    );
    expect(rendered.map((element) => element.tabIndex)).toEqual(STROKE_WIDTHS.map(() => -1));
  });
});
