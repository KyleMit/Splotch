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
      for (const selected of ['thin', 'medium', 'thick']) {
        const rendered = controls(tool, selected);
        expect(rendered).toHaveLength(3);
        expect(rendered.map((element) => element.getAttribute('aria-pressed'))).toEqual(
          ['thin', 'medium', 'thick'].map((width) => String(width === selected))
        );
        const active = rendered.find((element) => element.getAttribute('aria-pressed') === 'true');
        expect(active.getAttribute('aria-label')).toBe(
          `${tool === 'eraser' ? 'Eraser' : 'Drawing'} width: ${selected[0].toUpperCase()}${selected.slice(1)}`
        );
        expect(active.textContent).toContain('✓');
        expect(rendered.filter((element) => element.textContent.includes('✓'))).toHaveLength(1);
      }
    }
  );

  it('retains selected semantics while the actual Pressable blocks input', () => {
    const rendered = controls('eraser', 'thick', true);
    expect(rendered.map((element) => element.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
      'true',
    ]);
    expect(rendered.map((element) => element.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(rendered.map((element) => element.tabIndex)).toEqual([-1, -1, -1]);
  });
});
