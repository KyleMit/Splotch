import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { host, mount } from './rsd-native-selection-host.mjs';
import {
  BACK_BLOB_PX,
  BACK_ICON_PX,
  CRAYON_LABELS,
  NOT_FOUND_COPY,
  NOT_FOUND_MARK_PX,
  NOT_FOUND_MARK_TURN_DEG,
  PAGE_FRAMED_MAX_WIDTH_PX,
  PAGE_GUTTER,
  PAGE_SHEET_MAX_WIDTH_PX,
  RsdNotFoundPage,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdNotFoundPage.tsx';

const REPOSITORY = join(import.meta.dirname, '../../..');
const read = (path) => readFileSync(join(REPOSITORY, path), 'utf8').replace(/\s+/g, ' ');

describe("the web export's not-found page", () => {
  it('keeps the copy and literals NotFoundPage and PageShell declare', () => {
    const page = read('web/src/lib/components/page/NotFoundPage.svelte');
    expect(page).toContain(`<title>${NOT_FOUND_COPY.documentTitle}</title>`);
    expect(page).toContain(`title="${NOT_FOUND_COPY.title}"`);
    expect(page).toContain(`{#snippet lede()}${NOT_FOUND_COPY.lede}{/snippet}`);
    expect(page).toContain(`>${NOT_FOUND_COPY.startDrawing}</Button>`);
    expect(page).toContain(
      `width: ${NOT_FOUND_MARK_PX}px; height: ${NOT_FOUND_MARK_PX}px; transform: rotate(${NOT_FOUND_MARK_TURN_DEG}deg);`
    );
    expect(read('web/src/lib/components/page/backLabel.ts')).toContain(
      `COLD_VISIT_LABEL: BackLabel = '${NOT_FOUND_COPY.startDrawing}';`
    );
    const shell = read('web/src/lib/components/page/PageShell.svelte');
    const { minPx, viewportWidthPercent, maxPx } = PAGE_GUTTER;
    expect(shell).toContain(
      `--page-gutter: clamp(${minPx}px, ${viewportWidthPercent}vw, ${maxPx}px);`
    );
    expect(shell).toContain(`max-width: ${PAGE_SHEET_MAX_WIDTH_PX}px;`);
    expect(shell).toContain(`@media (max-width: ${PAGE_FRAMED_MAX_WIDTH_PX}px)`);
    const back = read('web/src/lib/components/page/BackLink.svelte');
    expect(back).toContain(`width: ${BACK_BLOB_PX}px;`);
    expect(back).toContain(`width: ${BACK_ICON_PX}px;`);
    const strip = read('web/src/lib/components/CrayonStrip.svelte');
    expect(strip).toContain(
      `const CRAYON_LABELS: PaletteLabel[] = [ ${CRAYON_LABELS.map((label) => `'${label}',`).join(' ')} ];`
    );
  });

  it('offers the way back to drawing under the shipping title', async () => {
    await mount(createElement(RsdNotFoundPage));
    expect(host.textContent).toContain(NOT_FOUND_COPY.title);
    expect(host.textContent).toContain(NOT_FOUND_COPY.lede);
    const starts = [...host.querySelectorAll('button')].filter((node) =>
      node.textContent.includes(NOT_FOUND_COPY.startDrawing)
    );
    expect(starts).toHaveLength(2);
    expect(host.textContent).toContain(NOT_FOUND_COPY.wordmark);
  });
});
