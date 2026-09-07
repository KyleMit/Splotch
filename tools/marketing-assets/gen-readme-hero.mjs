import { chromium } from '@playwright/test';
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { STORE_FRAME_IDENTITY_PATH } from '../../web/src/routes/dev/store-frames/lib/paths.ts';
import {
  canvasBox,
  expandDrawer,
  hasInk,
  openAppPage,
  pickColor,
} from '../app-driver/lib/app-driver.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { isMain, ROOT, sleep } from '../lib/proc.mjs';
import { portListenerPids, spawnViteServer } from '../lib/vite-server.mjs';
import { drawBalloonTall, drawDinosaurWide } from '../store-drawings/generated/store-drawings.mjs';
import { prepareCapture } from './lib/capture-preparation.mjs';

const DEFAULT_PORT = 5199;
const MAX_PORT = 65535;
const SERVER_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3000;
const SERVER_POLL_MS = 500;
const SCREENSHOT_SETTLE_MS = 500;
const CAPTURE_SCALE = 2;
const WEBP_QUALITY = 90;
const DEVICE_HEIGHT_PX = 880;
const BEZEL_PX = 24;
const HOME_BEZEL_PX = 56;
const DEVICE_RADIUS_PX = 40;
const SCREEN_RADIUS_PX = 18;
const HOME_ICON_PX = 28;
const MARGIN_PX = 24;
const GAP_PX = 48;
const FRAME_COLOR = '#25282d';
const FRAME_EDGE_COLOR = '#474b54';
const HOME_COLOR = '#afb4bd';
const OUTPUT = join(ROOT, 'docs/assets/readme-hero.webp');
const HOME_SVG = readFileSync(join(ROOT, 'web/src/lib/icons/home.svg'), 'utf8');
const DEVICES = [
  {
    name: 'phone',
    width: 432,
    height: DEVICE_HEIGHT_PX - BEZEL_PX - HOME_BEZEL_PX,
    rightBezel: BEZEL_PX,
    draw: drawBalloonTall,
    inset: { left: 0.12, top: 0.05, width: 0.84, height: 0.88 },
  },
  {
    name: 'tablet',
    width: 1248,
    height: DEVICE_HEIGHT_PX - BEZEL_PX * 2,
    rightBezel: HOME_BEZEL_PX,
    draw: drawDinosaurWide,
    inset: { left: 0.08, top: 0.06, width: 0.88, height: 0.84 },
  },
];

async function waitForCaptureServer(server, base) {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error('Capture server exited; inspect the startup error above.');
    let response;
    try {
      response = await fetch(new URL(STORE_FRAME_IDENTITY_PATH, base), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      await sleep(SERVER_POLL_MS);
      continue;
    }
    if (response.ok) {
      const identity = await response.json();
      if (identity.repoRoot !== realpathSync(ROOT)) {
        throw new Error(`Port is serving another checkout: ${identity.repoRoot}`);
      }
      return;
    }
    await sleep(SERVER_POLL_MS);
  }
  throw new Error(`Capture server did not become ready within ${SERVER_TIMEOUT_MS}ms`);
}

async function captureDrawing(browser, base, device) {
  const { ctx, page } = await openAppPage(
    browser,
    base,
    { ...device, deviceScaleFactor: CAPTURE_SCALE },
    { prepare: prepareCapture }
  );
  try {
    await page.waitForFunction(() => typeof window.__replayStroke === 'function');
    await expandDrawer(page);
    const box = await canvasBox(page);
    if (!box) throw new Error(`${device.name}: drawing canvas is unavailable`);
    const { inset } = device;
    await device.draw(
      page,
      {
        x: box.x + box.width * inset.left,
        y: box.y + box.height * inset.top,
        width: box.width * inset.width,
        height: box.height * inset.height,
      },
      { replay: 'engine' }
    );
    const green = PALETTE_COLORS.find(({ label }) => label === 'Green');
    if (!green || !(await pickColor(page, green.hex))) {
      throw new Error(`${device.name}: resting palette selection is unavailable`);
    }
    await sleep(SCREENSHOT_SETTLE_MS);
    if (!(await hasInk(page)))
      throw new Error(`${device.name}: drawing replay left a blank canvas`);
    return await page.screenshot();
  } finally {
    await ctx.close();
  }
}

async function frameDevice(capture, device) {
  const width = BEZEL_PX + device.width + device.rightBezel;
  const homeX = device.name === 'phone' ? width / 2 : width - HOME_BEZEL_PX / 2;
  const homeY =
    device.name === 'phone' ? DEVICE_HEIGHT_PX - HOME_BEZEL_PX / 2 : DEVICE_HEIGHT_PX / 2;
  const home = HOME_SVG.replace(/fill="[^"]+"/, `fill="${HOME_COLOR}"`).replace(
    '<svg ',
    `<svg x="${homeX - HOME_ICON_PX / 2}" y="${homeY - HOME_ICON_PX / 2}" width="${HOME_ICON_PX}" height="${HOME_ICON_PX}" `
  );
  const frame =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${DEVICE_HEIGHT_PX}">
    <rect x="1" y="1" width="${width - 2}" height="${DEVICE_HEIGHT_PX - 2}" rx="${DEVICE_RADIUS_PX}" fill="${FRAME_COLOR}" stroke="${FRAME_EDGE_COLOR}"/>
    ${home}
  </svg>`);
  const mask = Buffer.from(
    `<svg width="${device.width}" height="${device.height}"><rect width="100%" height="100%" rx="${SCREEN_RADIUS_PX}" fill="white"/></svg>`
  );
  const screen = await sharp(capture)
    .resize(device.width, device.height)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(frame)
    .composite([{ input: screen, left: BEZEL_PX, top: BEZEL_PX }])
    .png()
    .toBuffer();
}

async function composeHero(frames) {
  let left = MARGIN_PX;
  const layers = [];
  for (const frame of frames) {
    const { width } = await sharp(frame).metadata();
    layers.push({ input: frame, left, top: MARGIN_PX });
    left += width + GAP_PX;
  }
  return sharp({
    create: {
      width: left - GAP_PX + MARGIN_PX,
      height: DEVICE_HEIGHT_PX + MARGIN_PX * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

export async function generateReadmeHero(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: 'string', default: String(DEFAULT_PORT) },
      out: { type: 'string', default: OUTPUT },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log('Usage: npm run gen:readme-hero -- [--port <unused port>] [--out <file.webp>]');
    return;
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) throw new Error('Invalid --port');
  const output = resolve(values.out);
  if (!output.endsWith('.webp')) throw new Error('--out must end in .webp');
  if (portListenerPids(port).length)
    throw new Error(`Port ${port} is occupied; choose another --port.`);
  const base = `http://localhost:${port}/`;
  const { server, stop } = spawnViteServer(port, { env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' } });
  const temporaryOutput = `${output}.${process.pid}.tmp`;
  let browser;
  try {
    await waitForCaptureServer(server, base);
    browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
    const frames = [];
    for (const device of DEVICES) {
      console.log(`Capturing ${device.name}…`);
      frames.push(await frameDevice(await captureDrawing(browser, base, device), device));
    }
    const hero = await composeHero(frames);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(temporaryOutput, hero);
    await rename(temporaryOutput, output);
    console.log(`Saved ${output}`);
  } finally {
    try {
      await browser?.close();
    } finally {
      stop();
      await rm(temporaryOutput, { force: true });
    }
  }
}

if (isMain(import.meta.url)) {
  generateReadmeHero().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
