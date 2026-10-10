import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createWriteStream, existsSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const owned = '/private/tmp/native-stroke-widths';
const source = join(owned, 'repository');
const runtime = join(owned, 'compact-runtime-centered');
const output = join(owned, 'compact-browser-centered');
const node = '/Users/kylemit/.nvm/versions/node/v24.16.0/bin/node';
const expectedHead = process.argv[2];
const viewport = { width: 360, height: 640 };
const began = Date.now();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const report = { startedAt: new Date().toISOString(), scope: 'browser development only', viewport, expectedHead, phases: [], pageErrors: [], consoleErrors: [], checks: {}, screenshots: [] };
let server, browser, browserServer, page, serverLog;
const phase = (name, details = {}) => { report.phases.push({ name, at: new Date().toISOString(), ...details }); writeFileSync(join(output, 'live.json'), JSON.stringify(report, null, 2) + '\n'); };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  assert.ok(expectedHead && /^[a-f0-9]{40}$/.test(expectedHead));
  assert.equal(git(source, ['rev-parse', 'HEAD']), expectedHead);
  assert.equal(git(source, ['status', '--porcelain=v1']), '');
  assert.ok(!existsSync(runtime) && !existsSync(output));
  mkdirSync(output);
  phase('source-copy-start');
  execFileSync('git', ['clone', '--no-hardlinks', '--no-checkout', source, runtime], { stdio: 'pipe' });
  execFileSync('git', ['checkout', '--detach', expectedHead], { cwd: runtime, stdio: 'pipe' });
  execFileSync('/bin/cp', ['-cR', join(source, 'node_modules'), join(runtime, 'node_modules')]);
  assert.equal(git(runtime, ['status', '--porcelain=v1']), '');
  const files = git(runtime, ['ls-files']).split('\n').map((path) => ({ path, sha256: hash(readFileSync(join(runtime, path))) }));
  report.source = { worktree: runtime, head: expectedHead, tree: git(runtime, ['rev-parse', 'HEAD^{tree}']), files };
  report.dependencies = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].map((path) => {
    const bytes = readFileSync(join(runtime, path));
    assert.ok(bytes.equals(readFileSync(join(source, path))));
    return { path, sha256: hash(bytes) };
  });
  const inspectLinks = (path) => {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isSymbolicLink()) {
        const physical = realpathSync(child);
        assert.ok(physical.startsWith(join(runtime, 'node_modules') + '/'), `External copied dependency link: ${child}`);
        report.dependencyLinkCount = (report.dependencyLinkCount ?? 0) + 1;
      } else if (item.isDirectory()) inspectLinks(child);
    }
  };
  inspectLinks(join(runtime, 'node_modules'));
  const require = createRequire(join(runtime, 'package.json'));
  const { chromium, expect } = require('@playwright/test');
  const sharp = require('sharp');
  const { spawnOwnedChild, terminateOwnedChild } = await import(pathToFileURL(join(runtime, 'tools/migration/lib/web-host-processes.mjs')));
  report.tool = { node, nodeSha256: hash(readFileSync(node)), browser: chromium.executablePath(), browserSha256: hash(readFileSync(chromium.executablePath())) };
  const portOwner = createServer();
  await new Promise((resolve, reject) => { portOwner.once('error', reject); portOwner.listen(0, '127.0.0.1', resolve); });
  const port = portOwner.address().port;
  await new Promise((resolve) => portOwner.close(resolve));
  report.url = `http://localhost:${port}/`;
  serverLog = createWriteStream(join(output, 'metro.log.txt'), { flags: 'wx' });
  const inherited = Object.fromEntries(['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TZ', 'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'COREPACK_HOME', 'COREPACK_ENABLE_NETWORK'].filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]]));
  const env = { ...inherited, PATH: '/Users/kylemit/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin:/usr/sbin:/sbin', CI: 'true', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOCTOR: '1', EXPO_NO_ENVFILE: '1', EXPO_NO_TYPESCRIPT_SETUP: '1', __UNSAFE_EXPO_HOME_DIRECTORY: join(owned, 'cache/expo-home'), BROWSER: 'none', TMPDIR: join(owned, 'cache/tmp') };
  mkdirSync(env.TMPDIR, { recursive: true });
  const args = [join(runtime, 'node_modules/expo/bin/cli'), 'start', '--web', '--localhost', '--port', String(port), '--max-workers', '2'];
  server = spawnOwnedChild(node, args, { cwd: join(runtime, 'experiments/native-architecture'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(serverLog, { end: false }); server.stderr.pipe(serverLog, { end: false });
  report.server = { pid: server.pid, pgid: server.pid, argv: [node, ...args] };
  phase('metro-started', { port, pid: server.pid });
  const serverDeadline = Date.now() + 120_000;
  while (true) {
    assert.equal(server.exitCode, null, 'Metro stopped before readiness');
    try { const response = await fetch(report.url, { signal: AbortSignal.timeout(2_000) }); if (response.ok) break; } catch {}
    assert.ok(Date.now() < serverDeadline, 'Metro readiness deadline exceeded');
    await wait(500);
  }
  browserServer = await chromium.launchServer({ headless: true });
  report.browserPid = browserServer.process().pid;
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  await page.goto(report.url, { waitUntil: 'networkidle', timeout: 120_000 });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const choose = async (name) => { await expect(button(name)).toBeEnabled(); await button(name).click(); };
  const selected = async (name) => expect(button(name)).toHaveAttribute('aria-pressed', 'true');
  const shot = async (name, locator) => {
    const path = join(output, `${name}.png`);
    if (locator) await locator.screenshot({ path }); else await page.screenshot({ path });
    report.screenshots.push({ name, path, sha256: hash(readFileSync(path)) });
  };
  await expect(button('Drawing width: Medium')).toBeEnabled();
  await selected('Drawing width: Medium');
  await button('Drawing width: Medium').scrollIntoViewIfNeeded();
  await shot('phone-default-medium');
  report.checks.targets = [];
  for (const name of ['Thin', 'Medium', 'Thick']) {
    const box = await button(`Drawing width: ${name}`).boundingBox();
    assert.ok(box && box.width >= 52 && box.height >= 52 && box.x >= 0 && box.x + box.width <= viewport.width);
    report.checks.targets.push({ name, box });
  }
  await choose('Settings');
  const sound = page.getByRole('switch', { name: 'Drawing sound', exact: true });
  if (await sound.isChecked()) await sound.click();
  await choose('Close Settings');
  const paper = page.getByTestId('drawing-paper');
  async function draw(brush, width, from, to, name) {
    await choose(brush);
    const tool = brush === 'Eraser' ? 'Eraser' : 'Drawing';
    await choose(`${tool} width: ${width}`);
    await selected(`${tool} width: ${width}`);
    await button(`${tool} width: ${width}`).scrollIntoViewIfNeeded();
    await shot(`phone-${name}-selection`);
    await paper.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await wait(200);
    const before = await paper.boundingBox();
    phase(name + '-admission-geometry', { paperFrame: before, viewport, inputFrom: from, inputTo: to, absoluteFrom: before ? { x: before.x + from[0] * before.width, y: before.y + from[1] * before.height } : null, absoluteTo: before ? { x: before.x + to[0] * before.width, y: before.y + to[1] * before.height } : null });
    assert.ok(before && before.x >= 0 && before.x + before.width <= viewport.width && before.height > 150 && before.y >= 0 && before.y + before.height <= viewport.height);
    const position = ([x, y]) => ({ x: before.x + x * before.width, y: before.y + y * before.height });
    const start = position(from), end = position(to);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 6 });
    await expect(button(`${tool} width: ${width}`)).toBeDisabled();
    assert.deepEqual(await paper.boundingBox(), before, 'Paper frame changed during admitted contact');
    await page.mouse.move(end.x, end.y, { steps: 6 }); await page.mouse.up();
    await expect(button(`${tool} width: ${width}`)).toBeEnabled();
    phase(name + '-drawn', { paperFrame: before, width });
  }
  await choose('Blue paint');
  await draw('Marker', 'Thin', [.1, .14], [.9, .14], 'marker-thin');
  await draw('Marker', 'Thick', [.1, .31], [.9, .31], 'marker-thick');
  await draw('Crayon', 'Thin', [.1, .49], [.9, .49], 'crayon-thin');
  await draw('Crayon', 'Thick', [.1, .69], [.9, .69], 'crayon-thick');
  await draw('Eraser', 'Thin', [.36, .04], [.36, .86], 'eraser-thin');
  await draw('Eraser', 'Thick', [.65, .04], [.65, .86], 'eraser-thick');
  await shot('paper-two-eraser-widths', paper);
  const snapshots = () => page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('splotch-picture:')).map(([key, value]) => ({ key, drawing: JSON.parse(value) })).sort((a, b) => Number(b.key.split('-')[1]) - Number(a.key.split('-')[1])));
  const save = async () => { await choose('Save picture'); await page.getByText('Picture saved on this device.', { exact: true }).waitFor(); return (await snapshots())[0].drawing; };
  const exportPicture = async (name) => {
    const downloaded = page.waitForEvent('download');
    await choose('Export PNG');
    const path = join(output, `${name}.png`);
    await (await downloaded).saveAs(path);
    await page.getByText('PNG ready. Your picture is still here.', { exact: true }).waitFor();
    const png = readFileSync(path);
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    const image = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(image.info.width, 1024); assert.equal(image.info.height, 768);
    report.checks[name] = { path, bytes: png.length, sha256: hash(png), rgbaSha256: hash(image.data), ...image.info };
    return image;
  };
  const six = await save();
  assert.equal(six.version, 4);
  assert.deepEqual(six.strokes.map(({ brush, width }) => [brush, width]), [['marker',11],['marker',44],['crayon',17],['crayon',68],['eraser',22],['eraser',88]]);
  writeFileSync(join(output, 'saved-six.json'), JSON.stringify(six, null, 2) + '\n');
  const erased = await exportPicture('export-two-erasers');
  const pixel = (image, x, y) => image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4);
  const background = pixel(erased, 20, 20);
  const isBackground = (image, x, y) => pixel(image, x, y).equals(background);
  const markerY = Math.round(six.strokes[1].points[0].y);
  const gap = (x) => { let start = Math.round(x), end = start; while (start > 0 && isBackground(erased, start - 1, markerY)) start--; while (end < 1023 && isBackground(erased, end + 1, markerY)) end++; return end - start + 1; };
  const thinGap = gap(six.strokes[4].points[0].x), thickGap = gap(six.strokes[5].points[0].x);
  assert.ok(thickGap > thinGap * 2, 'Actual thick eraser gap did not exceed the independent thin gap');
  report.checks.eraserPixels = { thinGap, thickGap };
  await choose('Undo');
  const five = await save();
  assert.deepEqual(five, { ...six, strokes: six.strokes.slice(0, -1) });
  writeFileSync(join(output, 'saved-after-undo.json'), JSON.stringify(five, null, 2) + '\n');
  const beforeReopen = await exportPicture('export-before-reopen');
  await shot('phone-reachable-actions');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(button('Drawing width: Thick')).toBeEnabled();
  await selected('Drawing width: Thick');
  await choose('Eraser'); await selected('Eraser width: Thick');
  await choose('Marker'); await selected('Drawing width: Thick');
  await choose('Pictures');
  await page.getByRole('button', { name: /Open picture from/ }).first().click();
  await page.getByText('Picture opened. Undo returns to your previous picture.', { exact: true }).waitFor();
  const afterReopen = await exportPicture('export-after-reopen');
  assert.ok(beforeReopen.data.equals(afterReopen.data), 'Actual save/reopen changed exported RGBA');
  const thickness = (stroke) => { const y = Math.round(stroke.points[0].y); let count = 0; for (let row = y - 55; row <= y + 55; row++) if (!isBackground(afterReopen, 205, row)) count++; return count; };
  const thinPaint = thickness(five.strokes[0]), thickPaint = thickness(five.strokes[1]);
  assert.ok(thickPaint > thinPaint * 2, 'Actual thick Marker did not exceed the thin Marker coverage');
  report.checks.markerPixels = { thinPaint, thickPaint };
  report.checks.savedWidths = five.strokes.map((stroke) => stroke.width);
  report.checks.settings = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('splotch-candidate:')).map(([key, value]) => ({ key, value: JSON.parse(value) })));
  assert.deepEqual(report.checks.settings.map(({ value }) => value), [{ version: 2, soundEnabled: false, strokeWidth: 'thick', eraserWidth: 'thick' }]);
  await shot('paper-reopened-widths', paper);
  await button('Drawing width: Thick').scrollIntoViewIfNeeded(); await shot('phone-restored-drawing-thick');
  await choose('Eraser'); await button('Eraser width: Thick').scrollIntoViewIfNeeded(); await shot('phone-restored-eraser-thick');
  assert.deepEqual(report.pageErrors, []);
  assert.equal(git(runtime, ['status', '--porcelain=v1']), '');
  for (const file of files) assert.equal(hash(readFileSync(join(runtime, file.path))), file.sha256, `Maintained source changed: ${file.path}`);
  report.status = 'passed-browser-development-only';
  await terminateOwnedChild(server);
} catch (error) {
  report.status = 'failed'; report.failure = error.stack ?? String(error); process.exitCode = 1;
  if (page && !page.isClosed()) {
    await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    report.failureAppText = await page.locator('body').innerText().catch(() => 'unavailable');
    report.failureStorage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('splotch-')))).catch(() => null);
  }
} finally {
  if (browser) await browser.close().catch((error) => { report.browserCloseFailure = String(error); process.exitCode = 1; });
  if (browserServer) await browserServer.close().catch((error) => { report.browserServerCloseFailure = String(error); process.exitCode = 1; });
  if (server) {
    const { terminateOwnedChild } = await import(pathToFileURL(join(runtime, 'tools/migration/lib/web-host-processes.mjs')));
    report.serverClose = await terminateOwnedChild(server);
  }
  if (serverLog) await new Promise((resolve) => serverLog.end(resolve));
  report.terminalAt = new Date().toISOString(); report.elapsedMs = Date.now() - began;
  if (existsSync(output)) writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, failure: report.failure, elapsedMs: report.elapsedMs, output }));
}
