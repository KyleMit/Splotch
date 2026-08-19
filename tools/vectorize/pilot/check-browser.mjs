import { readFile, writeFile } from 'node:fs/promises';
import { chromium, webkit } from '@playwright/test';
import { isMain, runMain } from '../../lib/proc.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const samples = [
  {
    name: 'circle-pen',
    width: 1024,
    height: 1536,
    svg: 'tools/vectorize/pilot/circle-tall-pen.optimized.svg',
    webp: 'web/static/coloring/shapes/circle-tall.overlay.webp',
  },
  {
    name: 'owl-pen',
    width: 1024,
    height: 1536,
    svg: 'tools/vectorize/pilot/owl-tall-pen.optimized.svg',
    webp: 'web/static/coloring/creatures/owl-tall.overlay.webp',
  },
  {
    name: 'owl-chalk',
    width: 1024,
    height: 1536,
    svg: 'tools/vectorize/pilot/owl-tall-chalk.optimized.svg',
    webp: 'web/static/coloring/creatures/owl-tall.dark.overlay.webp',
  },
];

async function dataUrl(relative, mime) {
  return `data:${mime};base64,${(await readFile(`${root}${relative}`)).toString('base64')}`;
}

export async function checkVectorPilotBrowsers() {
  for (const sample of samples) {
    sample.svgUrl = await dataUrl(sample.svg, 'image/svg+xml');
    sample.webpUrl = await dataUrl(sample.webp, 'image/webp');
  }

  const results = [];
  for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
    let browser;
    try {
      browser = await browserType.launch({ headless: true });
    } catch (error) {
      results.push({ engine, unavailable: String(error) });
      continue;
    }
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    for (const sample of samples) {
      for (const format of ['svg', 'webp']) {
        const measurements = await page.evaluate(
          async ({ url, width, height }) => {
            const runs = [];
            for (let run = 0; run < 5; run += 1) {
              const started = performance.now();
              const image = new Image();
              image.src = `${url}#run-${run}`;
              await image.decode();
              const decoded = performance.now();
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext('2d');
              context.drawImage(image, 0, 0, width, height);
              const pixel = context.getImageData(
                Math.floor(width / 2),
                Math.floor(height / 2),
                1,
                1
              ).data;
              const encoded = canvas.toDataURL('image/png');
              const completed = performance.now();
              runs.push({
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                decodeMs: decoded - started,
                drawAndExportMs: completed - decoded,
                centerAlpha: pixel[3],
                pngDataUrlLength: encoded.length,
              });
            }
            return runs;
          },
          { url: sample[`${format}Url`], width: sample.width, height: sample.height }
        );
        const values = (key) =>
          measurements.map((measurement) => measurement[key]).sort((a, b) => a - b);
        const median = (key) => values(key)[Math.floor(measurements.length / 2)];
        results.push({
          engine,
          sample: sample.name,
          format,
          naturalSize: `${measurements[0].naturalWidth}x${measurements[0].naturalHeight}`,
          medianDecodeMs: median('decodeMs'),
          medianDrawAndExportMs: median('drawAndExportMs'),
          pngDataUrlLength: measurements[0].pngDataUrlLength,
        });
      }
    }
    await browser.close();
  }

  await writeFile(
    `${root}tools/vectorize/pilot/browser-report.json`,
    `${JSON.stringify(results, null, 2)}\n`
  );
  console.log(JSON.stringify(results, null, 2));
}

if (isMain(import.meta.url)) runMain(checkVectorPilotBrowsers);
