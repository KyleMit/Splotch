// AI-1 (AI flow through deterministic fixtures), rn-web-chromium cells. Each cell drives both arms
// through the same public controls against the labeled fixture in ai-fixture.mjs and returns the
// visible states, the recorded requests and the retry behavior.
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { AI_REPLIES, heldReply, installAiFixture } from './ai-fixture.mjs';
import {
  boot,
  capture,
  collapseDrawer,
  contact,
  drawStrokes,
  expandDrawer,
  onBothArms,
  openDialogs,
  openSection,
  openSettings,
  PROFILES,
  visibilityShim,
} from './harness.mjs';
import { readBanner } from './page-probes.mjs';
import { perArmBehindProxy, registerByStrokes, workerState } from './web-1-sw.mjs';

export const RECORD = 'ai-1-observations.json';

const INK = [
  [0.3, 0.4],
  [0.6, 0.45],
];
const PICTURE_WAIT_MS = 6000;

const aiSwitch = (s, name) =>
  s.page.getByRole('switch', { name }).filter({ visible: true }).first();

async function closeDialogs(s) {
  for (let i = 0; i < 3 && (await openDialogs(s)).length; i += 1) {
    await s.page.keyboard.press('Escape');
    await s.page.waitForTimeout(1000);
  }
}

async function setSwitch(s, name, on) {
  const control = aiSwitch(s, name);
  if (((await control.getAttribute('aria-checked')) === 'true') !== on) {
    await control.click();
    await s.page.waitForTimeout(800);
  }
}

// AI on through Settings › AI Art (no grown-up check on web), optional preferences, then ink.
async function aiReady(s, { customize = true, autoSave = false, path = '/' } = {}) {
  await boot(s, path);
  await openSettings(s);
  await openSection(s, 'AI Art');
  await setSwitch(s, 'Create AI Images', true);
  await setSwitch(s, 'Customize AI Style', customize);
  await setSwitch(s, 'Auto-Save AI Images', autoSave);
  await closeDialogs(s);
  await contact(s, [INK]);
}

function wand(s) {
  return s.page
    .getByRole('button', { name: /AI image/ })
    .filter({ visible: true })
    .first();
}

async function tapWand(s) {
  await expandDrawer(s);
  const control = wand(s);
  const label = (await control.count()) ? await control.getAttribute('aria-label') : null;
  if (label) await control.click();
  await s.page.waitForTimeout(1500);
  return label;
}

async function pickStyle(s, style = 'Sticker') {
  const choice = s.page
    .getByRole('button', { name: style, exact: true })
    .filter({ visible: true })
    .first();
  if (!(await choice.count())) return false;
  await choice.click();
  return true;
}

async function generate(s, style = 'Sticker') {
  const wandLabel = await tapWand(s);
  const prompt = await openDialogs(s);
  const styled = await pickStyle(s, style);
  return { wandLabel, prompt, styled };
}

// What the AI surfaces show: the open dialogs, the result card's text and controls, live status
// copy, the decoded picture, the drawer's AI button and any minimized polaroid.
function readAi() {
  const visible = (element) => element.checkVisibility();
  const named = (element) =>
    (element.getAttribute('aria-label') || element.innerText || '').replace(/\s+/g, ' ').trim();
  const box = (element) => {
    const r = element.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };
  const card = [...document.querySelectorAll('dialog[open], [role="dialog"]')].find(
    (element) => visible(element) && /AI Result/.test(element.getAttribute('aria-label') ?? '')
  );
  const picture = card
    ? [...card.querySelectorAll('img')].filter(visible).find((image) => image.naturalWidth > 64)
    : null;
  return {
    dialogs: [...document.querySelectorAll('dialog[open], [role="dialog"]')]
      .filter(visible)
      .map(
        (element) =>
          element.getAttribute('aria-label') ||
          element.querySelector('h1, h2')?.innerText?.trim() ||
          'unnamed'
      ),
    card: card ? box(card) : null,
    text: card ? card.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : null,
    controls: card
      ? [...card.querySelectorAll('button, a, [role="button"]')]
          .filter(visible)
          .map((element) => ({ name: named(element), box: box(element) }))
      : [],
    picture: picture
      ? { decoded: picture.complete && picture.naturalWidth > 0, box: box(picture) }
      : null,
    statuses: [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')]
      .filter(visible)
      .map(named)
      .filter(Boolean),
    wand:
      [...document.querySelectorAll('button')]
        .filter(visible)
        .map(named)
        .find((name) => /AI image/.test(name)) ?? null,
    polaroid:
      [...document.querySelectorAll('button')]
        .filter(visible)
        .map(named)
        .find((name) => /Your picture is/.test(name)) ?? null,
    focus: document.activeElement
      ? `${document.activeElement.tagName.toLowerCase()}${document.activeElement.getAttribute('role') ? `[role=${document.activeElement.getAttribute('role')}]` : ''} ${named(document.activeElement).slice(0, 60)}`.trim()
      : null,
  };
}

const ai = (s) => s.page.evaluate(readAi);

// The open drawer's controls, left to right: a hidden AI button must leave no gap between them.
function drawerRow() {
  const bottomBand = innerHeight * 0.6;
  return [...document.querySelectorAll('button, [role="button"]')]
    .filter((element) => element.checkVisibility())
    .map((element) => ({ element, box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.top > bottomBand && box.width > 0)
    .sort((a, b) => a.box.left - b.box.left)
    .map(({ element, box }) => ({
      name: (element.getAttribute('aria-label') ?? element.innerText).trim(),
      x: Math.round(box.left),
      y: Math.round(box.top),
      w: Math.round(box.width),
      h: Math.round(box.height),
    }));
}

async function frame(s, name) {
  const image = await s.page.screenshot();
  const path = new URL(`./shots/${name}.webp`, import.meta.url).pathname;
  writeFileSync(path, await sharp(image).resize({ width: 360 }).webp({ quality: 55 }).toBuffer());
  return `shots/${name}.webp`;
}

async function cardButton(s, pattern) {
  const control = s.page.getByRole('button', { name: pattern }).filter({ visible: true }).first();
  if (!(await control.count())) return false;
  await control.click();
  await s.page.waitForTimeout(1500);
  return true;
}

const summary = (log) =>
  log.map((entry) => ({
    request: `${entry.method} ${entry.path}`,
    crossOrigin: !entry.host.startsWith('127.0.0.1'),
    origin: entry.origin ? 'present' : 'absent',
    upload: entry.upload,
    credential: entry.credential,
    reply: entry.reply,
  }));

export const CELLS = {
  'ai-fresh-install': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx);
      await boot(s);
      await expandDrawer(s);
      const drawer = await ai(s);
      await collapseDrawer(s);
      await openSettings(s);
      await openSection(s, 'AI Art');
      const settings = await s.page.evaluate(
        () =>
          [...document.querySelectorAll('dialog[open], [role="dialog"]')]
            .find((element) => element.checkVisibility())
            ?.innerText.replace(/\s+/g, ' ')
            .match(/AI Art.{0,500}/)?.[0] ?? null
      );
      const keyField = await s.page
        .locator('input[placeholder="Paste your OpenAI API key"]')
        .filter({ visible: true })
        .count();
      return {
        requests: summary(log),
        drawerWand: drawer.wand,
        aiSwitch: await aiSwitch(s, 'Create AI Images').getAttribute('aria-checked'),
        keyField,
        settings,
        shot: await capture(s, `ai-fresh-settings-${s.arm}`),
      };
    }),

  'ai-success': async (browser) => {
    const result = {};
    for (const profile of ['iphone', 'desktop']) {
      result[profile] = await onBothArms(browser, profile, async (s) => {
        const held = heldReply(
          AI_REPLIES.picture(profile === 'desktop' ? 'landscape' : 'portrait')
        );
        const log = await installAiFixture(s.ctx, { '/api/generate-image': [held.reply] });
        await aiReady(s);
        const started = await generate(s);
        const promptShot = null;
        await s.page.waitForTimeout(1200);
        const waiting = await ai(s);
        const dialShot = await frame(s, `ai-dial-${profile}-${s.arm}`);
        held.release();
        await s.page.waitForTimeout(PICTURE_WAIT_MS);
        const shown = await ai(s);
        const resultShot = await capture(s, `ai-result-${profile}-${s.arm}`);
        await cardButton(s, /^Close$/);
        const closed = await ai(s);
        return {
          started,
          promptShot,
          waiting,
          dialShot,
          shown,
          resultShot,
          closed,
          requests: summary(log),
        };
      });
    }
    return result;
  },

  'ai-prompt': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      await installAiFixture(s.ctx);
      await aiReady(s);
      const wandLabel = await tapWand(s);
      const styles = await s.page.evaluate(() => {
        const dialog = [...document.querySelectorAll('dialog[open], [role="dialog"]')].find(
          (element) => element.checkVisibility()
        );
        return dialog
          ? [...dialog.querySelectorAll('button')]
              .filter((element) => element.checkVisibility())
              .map((element) => (element.getAttribute('aria-label') || element.innerText).trim())
          : null;
      });
      return {
        wandLabel,
        dialogs: await openDialogs(s),
        styles,
        shot: await capture(s, `ai-prompt-${s.arm}`),
      };
    }),

  'ai-customization-off': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
      await aiReady(s, { customize: false });
      const wandLabel = await tapWand(s);
      const dialogsAfterTap = await openDialogs(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      return { wandLabel, dialogsAfterTap, shown: await ai(s), requests: summary(log) };
    }),

  'ai-refusal-and-report': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.refusal] });
      await aiReady(s);
      await generate(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const refused = await ai(s);
      const refusedShot = await capture(s, `ai-refusal-${s.arm}`);
      const reportOpened = await cardButton(s, /Report|mistake/i);
      const confirm = await openDialogs(s);
      const confirmShot = await capture(s, `ai-refusal-report-confirm-${s.arm}`);
      const cancelled = await cardButton(s, /^Cancel$/);
      const afterCancel = await ai(s);
      await cardButton(s, /Report|mistake/i);
      const sent = await cardButton(s, /^Send|Report it|Yes/);
      await s.page.waitForTimeout(2000);
      return {
        refused,
        refusedShot,
        reportOpened,
        confirm,
        confirmShot,
        cancelled,
        focusAfterCancel: afterCancel.focus,
        sent,
        afterSend: await ai(s),
        requests: summary(log),
      };
    }),

  'ai-retry-then-success': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.serverError, AI_REPLIES.picture()],
      });
      await aiReady(s);
      await generate(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const failed = await ai(s);
      const failedShot = await capture(s, `ai-failed-once-${s.arm}`);
      const retried = await cardButton(s, /Try again/i);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      return { failed, failedShot, retried, afterRetry: await ai(s), requests: summary(log) };
    }),

  'ai-still-not-working': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.serverError],
      });
      await aiReady(s);
      await generate(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const first = await ai(s);
      await cardButton(s, /Try again/i);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const second = await ai(s);
      const secondShot = await capture(s, `ai-still-not-working-${s.arm}`);
      const problemReport = await cardButton(s, /problem|Tell us|Report/i);
      const problemDialogs = await openDialogs(s);
      const problemText = await s.page.evaluate(() =>
        [...document.querySelectorAll('dialog[open], [role="dialog"]')]
          .filter((element) => element.checkVisibility())
          .map((element) => element.innerText.replace(/\s+/g, ' ').slice(0, 400))
      );
      await closeDialogs(s);
      await contact(s, [INK.map(([x, y]) => [x, y + 0.1])]);
      await generate(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const afterReopen = await ai(s);
      return {
        first,
        second,
        secondShot,
        problemReport,
        problemDialogs,
        problemText,
        afterReopen,
        requests: summary(log),
      };
    }),

  'ai-timeout': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.hang, AI_REPLIES.picture()],
      });
      await aiReady(s);
      await generate(s);
      const marks = {};
      for (const atS of [10, 30, 40]) {
        await s.page.waitForTimeout(atS === 10 ? 10_000 : atS === 30 ? 20_000 : 10_000);
        marks[`${atS}s`] = await ai(s);
      }
      const shot = await capture(s, `ai-timeout-40s-${s.arm}`);
      const minimized = await cardButton(s, /Keep drawing|Minimi[sz]e/i);
      await contact(s, [INK.map(([x, y]) => [x, y + 0.2])]);
      const drewWhileWaiting = await ai(s);
      const retried = await cardButton(s, /Try again/i);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      return {
        marks,
        shot,
        minimized,
        drewWhileWaiting,
        retried,
        afterRetry: await ai(s),
        requests: summary(log),
      };
    }),

  'ai-throttled-and-malformed': async (browser) => {
    const result = {};
    for (const [name, reply] of [
      ['429', AI_REPLIES.throttled],
      ['bare-502', AI_REPLIES.bare502],
      ['malformed-json', AI_REPLIES.malformedJson],
      ['wrong-type', AI_REPLIES.wrongType],
      ['unexpected-fields', AI_REPLIES.unexpectedFields],
    ]) {
      result[name] = await onBothArms(browser, 'iphone', async (s) => {
        const log = await installAiFixture(s.ctx, {
          '/api/generate-image': [reply, AI_REPLIES.picture()],
        });
        await aiReady(s);
        await generate(s);
        await s.page.waitForTimeout(PICTURE_WAIT_MS);
        const state = await ai(s);
        const shot = await capture(s, `ai-${name}-${s.arm}`);
        const retried = await cardButton(s, /Try again/i);
        await s.page.waitForTimeout(PICTURE_WAIT_MS);
        return { state, shot, retried, afterRetry: await ai(s), requests: summary(log) };
      });
    }
    return result;
  },

  'ai-poll-past-240s': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.ticket, AI_REPLIES.picture()],
        '/api/generation-result': [AI_REPLIES.pending],
      });
      await aiReady(s);
      await generate(s);
      const marks = {};
      for (const atS of [60, 230, 260]) {
        await s.page.waitForTimeout(atS === 60 ? 60_000 : atS === 230 ? 170_000 : 30_000);
        marks[`${atS}s`] = await ai(s);
      }
      const shot = await capture(s, `ai-poll-260s-${s.arm}`);
      const polls = log.filter((entry) => entry.path === '/api/generation-result').length;
      const retried = await cardButton(s, /Try again/i);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      return {
        marks,
        shot,
        polls,
        retried,
        afterRetry: await ai(s),
        requests: summary(log).slice(0, 4),
      };
    }),

  'ai-minimize-and-ready': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const held = heldReply(AI_REPLIES.picture());
      const log = await installAiFixture(s.ctx, { '/api/generate-image': [held.reply] });
      await aiReady(s);
      await generate(s);
      await s.page.waitForTimeout(1500);
      const waiting = await ai(s);
      const minimized = await cardButton(s, /Keep drawing|Minimi[sz]e/i);
      const asPolaroid = await ai(s);
      const polaroidShot = await capture(s, `ai-polaroid-waiting-${s.arm}`);
      await contact(s, [INK.map(([x, y]) => [x, y + 0.15])]);
      held.release();
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const ready = await ai(s);
      const readyShot = await capture(s, `ai-polaroid-ready-${s.arm}`);
      const reopened = ready.polaroid ? await cardButton(s, /Your picture is/) : false;
      await s.page.waitForTimeout(1500);
      return {
        waiting,
        minimized,
        asPolaroid,
        polaroidShot,
        ready,
        readyShot,
        reopened,
        restored: await ai(s),
        requests: summary(log),
      };
    }),

  'ai-picture-report': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
      await aiReady(s);
      await generate(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      await cardButton(s, /Report this picture/);
      const confirm = await openDialogs(s);
      const confirmText = await s.page.evaluate(() =>
        [...document.querySelectorAll('dialog[open], [role="dialog"]')]
          .filter((element) => element.checkVisibility())
          .map((element) => element.innerText.replace(/\s+/g, ' ').slice(0, 300))
          .pop()
      );
      const confirmShot = await capture(s, `ai-report-confirm-${s.arm}`);
      await cardButton(s, /^Cancel$/);
      const afterCancel = await ai(s);
      await cardButton(s, /Report this picture/);
      await cardButton(s, /^Send|^Report$|Yes/);
      await s.page.waitForTimeout(2500);
      const afterSend = await ai(s);
      const sentShot = await capture(s, `ai-report-sent-${s.arm}`);
      return {
        confirm,
        confirmText,
        confirmShot,
        afterCancel,
        afterSend,
        sentShot,
        requests: summary(log),
      };
    }),

  'ai-report-rejected-then-retry': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.picture()],
        '/api/report-image': [
          () => ({ status: 500, json: { ok: false, error: 'Fixture: report failed.' } }),
          () => ({
            status: 200,
            json: { ok: true, reportId: '17-00000000-0000-0000-0000-000000000002' },
          }),
        ],
      });
      await aiReady(s);
      await generate(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      await cardButton(s, /Report this picture/);
      await cardButton(s, /^Send|^Report$|Yes/);
      await s.page.waitForTimeout(2500);
      const rejected = {
        dialogs: await openDialogs(s),
        text: await s.page.evaluate(() =>
          [...document.querySelectorAll('dialog[open], [role="dialog"]')]
            .filter((element) => element.checkVisibility())
            .map((element) => element.innerText.replace(/\s+/g, ' ').slice(0, 300))
            .pop()
        ),
      };
      const shot = await capture(s, `ai-report-rejected-${s.arm}`);
      const retried = await cardButton(s, /Try again|Send|Report/);
      await s.page.waitForTimeout(2500);
      return { rejected, shot, retried, after: await ai(s), requests: summary(log) };
    }),

  'ai-settings-deep-link': async (browser) => {
    const result = {};
    for (const profile of ['iphone', 'desktop']) {
      result[profile] = await onBothArms(browser, profile, async (s) => {
        const log = await installAiFixture(s.ctx, {
          '/api/free-generation-grant': [
            () => ({ status: 200, json: { ok: true, remaining: 0, limit: 10 } }),
          ],
        });
        await aiReady(s);
        const wandLabel = await tapWand(s);
        const dialogs = await openDialogs(s);
        const settingsText = await s.page.evaluate(
          () =>
            [...document.querySelectorAll('dialog[open], [role="dialog"]')]
              .find((element) => element.checkVisibility())
              ?.innerText.replace(/\s+/g, ' ')
              .slice(0, 300) ?? null
        );
        const keyField = await s.page
          .locator('input[placeholder="Paste your OpenAI API key"]')
          .filter({ visible: true })
          .count();
        return {
          wandLabel,
          dialogs,
          settingsText,
          keyFieldVisible: keyField > 0,
          shot: await capture(s, `ai-deep-link-${profile}-${s.arm}`),
          requests: summary(log),
        };
      });
    }
    return result;
  },

  'ai-offline-button': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx);
      await aiReady(s);
      await expandDrawer(s);
      const online = await ai(s);
      const onlineShot = await capture(s, `ai-online-drawer-${s.arm}`);
      await s.ctx.setOffline(true);
      await s.page.waitForTimeout(2000);
      const offline = await ai(s);
      const offlineShot = await capture(s, `ai-offline-drawer-${s.arm}`);
      const grantsBefore = log.filter(
        (entry) => entry.path === '/api/free-generation-grant'
      ).length;
      await s.ctx.setOffline(false);
      await s.page.waitForTimeout(3000);
      return {
        online: online.wand,
        offline: offline.wand,
        offlineShot,
        onlineShot,
        back: (await ai(s)).wand,
        grantsAfterReconnect:
          log.filter((entry) => entry.path === '/api/free-generation-grant').length - grantsBefore,
      };
    }),

  // Each arm behind its own proxy origin, so the worker it registers controls the offline reload.
  'ai-offline-first-paint': (browser) =>
    perArmBehindProxy(browser, 'iphone', async (s) => {
      await installAiFixture(s.ctx);
      await aiReady(s);
      const worker = await registerByStrokes(s);
      await boot(s);
      const controlled = (await s.page.evaluate(workerState)).controlled;
      // The strokes that register the worker also earn the install banner; it is set aside alike.
      const notNow = s.page
        .getByRole('button', { name: 'Not now', exact: true })
        .filter({ visible: true });
      const bannerDismissed = (await notNow.count()) > 0;
      if (bannerDismissed) await notNow.first().click();
      await s.page.waitForTimeout(1200);
      await expandDrawer(s);
      const online = { wand: (await ai(s)).wand, row: await s.page.evaluate(drawerRow) };
      await s.ctx.setOffline(true);
      await s.page.waitForTimeout(1500);
      await s.page.reload();
      await s.page.locator(s.paper).waitFor({ state: 'visible', timeout: 15_000 });
      await expandDrawer(s);
      return {
        worker: worker.active,
        controlled,
        bannerDismissed,
        online,
        offline: { wand: (await ai(s)).wand, row: await s.page.evaluate(drawerRow) },
        shot: await capture(s, `ai-offline-first-paint-${s.arm}`),
      };
    }),

  'ai-grant-retry-on-return': (browser) =>
    onBothArms(
      browser,
      'iphone',
      async (s) => {
        const log = await installAiFixture(s.ctx, {
          '/api/free-generation-grant': [
            () => ({ status: 503, json: { ok: false, error: 'Free generations are unavailable' } }),
            () => ({ status: 200, json: { ok: true, remaining: 10, limit: 10 } }),
          ],
        });
        await aiReady(s);
        await expandDrawer(s);
        const failed = await ai(s);
        await s.page.evaluate(() => {
          window.__setHidden(true);
          window.__setHidden(false);
          window.dispatchEvent(new Event('focus'));
        });
        await s.page.waitForTimeout(3000);
        return {
          failed: failed.wand,
          recovered: (await ai(s)).wand,
          grants: log
            .filter((entry) => entry.path === '/api/free-generation-grant')
            .map((entry) => entry.reply),
        };
      },
      { initScripts: [visibilityShim] }
    ),

  'ai-download-and-auto-save': (browser) =>
    onBothArms(
      browser,
      'desktop',
      async (s) => {
        const downloads = [];
        s.page.on('download', (download) =>
          downloads.push(download.suggestedFilename().replace(/\d/g, '#'))
        );
        const log = await installAiFixture(s.ctx, {
          '/api/generate-image': [AI_REPLIES.picture('landscape')],
        });
        await aiReady(s, { autoSave: true });
        await generate(s);
        await s.page.waitForTimeout(PICTURE_WAIT_MS + 2000);
        const autoSaved = [...downloads];
        const footer = (await ai(s)).text;
        await cardButton(s, /^Download$/);
        await s.page.waitForTimeout(2500);
        return {
          autoSaved,
          footer,
          afterDownload: downloads.slice(autoSaved.length),
          requests: summary(log),
        };
      },
      { context: { acceptDownloads: true } }
    ),

  'ai-layout': async (browser) => {
    const result = {};
    for (const [name, profile, colorScheme, turnTo] of [
      ['phone-light', 'iphone', 'light'],
      ['phone-dark', 'iphone', 'dark'],
      ['landscape', 'iphone', 'light', PROFILES['iphone-landscape'].viewport],
      ['desktop', 'desktop', 'light'],
    ]) {
      result[name] = await onBothArms(
        browser,
        profile,
        async (s) => {
          await installAiFixture(s.ctx, {
            '/api/generate-image': [
              AI_REPLIES.picture(profile === 'iphone' && !turnTo ? 'portrait' : 'landscape'),
            ],
          });
          await aiReady(s);
          if (turnTo) {
            await s.page.setViewportSize(turnTo);
            await s.page.waitForTimeout(1500);
          }
          await generate(s);
          await s.page.waitForTimeout(PICTURE_WAIT_MS);
          const state = await ai(s);
          return {
            card: state.card,
            picture: state.picture,
            controls: state.controls,
            shot: await capture(s, `ai-layout-${name}-${s.arm}`),
          };
        },
        { context: { colorScheme } }
      );
    }
    return result;
  },

  'ai-install-banner-suppression': (browser) =>
    onBothArms(browser, 'android', async (s) => {
      const held = heldReply(AI_REPLIES.picture());
      await installAiFixture(s.ctx, { '/api/generate-image': [held.reply] });
      await aiReady(s);
      await drawStrokes(s, 3);
      await s.page.waitForTimeout(1200);
      const bannerBefore = (await s.page.evaluate(readBanner)).present;
      await generate(s);
      await s.page.waitForTimeout(1500);
      await cardButton(s, /Keep drawing|Minimi[sz]e/i);
      await collapseDrawer(s);
      await s.page.waitForTimeout(1200);
      const whileMinimized = {
        banner: (await s.page.evaluate(readBanner)).present,
        polaroid: (await ai(s)).polaroid,
      };
      const shot = await capture(s, `ai-banner-minimized-${s.arm}`);
      held.release();
      return { bannerBefore, whileMinimized, shot };
    }),

  // X2: the RN attempt journal was capped at 32. Thirty-three direct generations, each closed.
  'ai-attempt-33': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
      await aiReady(s, { customize: false });
      const outcomes = [];
      for (let attempt = 1; attempt <= 33; attempt += 1) {
        await expandDrawer(s);
        const label = await wand(s)
          .getAttribute('aria-label')
          .catch(() => null);
        await wand(s)
          .click({ timeout: 5000 })
          .catch(() => {});
        await s.page.waitForTimeout(2500);
        const state = await ai(s);
        outcomes.push({ attempt, label, ready: /Your picture is ready/.test(state.text ?? '') });
        await cardButton(s, /^Close$/);
      }
      const posts = log.filter((entry) => entry.path === '/api/generate-image').length;
      return {
        posts,
        readyCount: outcomes.filter((entry) => entry.ready).length,
        last: outcomes.slice(-3),
        shot: await capture(s, `ai-attempt-33-${s.arm}`),
      };
    }),

  // X31: what each arm keeps after three pictures (origin storage estimate and named stores).
  'ai-originals-storage': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
      await aiReady(s, { customize: false });
      const usage = () =>
        s.page.evaluate(async () => ({
          usage: (await navigator.storage.estimate()).usage,
          localStorageBytes: Object.keys(localStorage).reduce(
            (sum, key) => sum + key.length + (localStorage.getItem(key)?.length ?? 0),
            0
          ),
          databases: (await indexedDB.databases()).map((database) => database.name).sort(),
        }));
      const before = await usage();
      for (let i = 0; i < 3; i += 1) {
        await expandDrawer(s);
        await wand(s).click();
        await s.page.waitForTimeout(3500);
        await cardButton(s, /^Close$/);
      }
      return { before, after: await usage() };
    }),

  // The visible picture compared pixel by pixel inside the result card, both arms in one state.
  'ai-result-pixels': async (browser) => {
    const result = {};
    for (const [profile, clip] of [
      ['iphone', { left: 24, top: 115, width: 342, height: 512 }],
      ['desktop', { left: 215, top: 88, width: 850, height: 564 }],
    ]) {
      const frames = {};
      const states = await onBothArms(browser, profile, async (s) => {
        await installAiFixture(s.ctx, {
          '/api/generate-image': [
            AI_REPLIES.picture(profile === 'iphone' ? 'portrait' : 'landscape'),
          ],
        });
        await aiReady(s);
        await generate(s);
        await s.page.waitForTimeout(PICTURE_WAIT_MS);
        const shot = await capture(s, `ai-result-pixels-${profile}-${s.arm}`);
        frames[s.arm] = await s.page.screenshot();
        return { shot };
      });
      const [a, b] = await Promise.all(
        ['rn-web', 'web-prod'].map((arm) => sharp(frames[arm]).extract(clip).raw().toBuffer())
      );
      let differing = 0;
      let sum = 0;
      for (let i = 0; i < a.length; i += 3) {
        const delta = Math.max(
          Math.abs(a[i] - b[i]),
          Math.abs(a[i + 1] - b[i + 1]),
          Math.abs(a[i + 2] - b[i + 2])
        );
        sum += delta;
        if (delta > 24) differing += 1;
      }
      const pixels = a.length / 3;
      result[profile] = {
        ...states,
        clip,
        differingPercent: Number(((100 * differing) / pixels).toFixed(2)),
        meanAbsDelta: Number((sum / pixels).toFixed(2)),
      };
    }
    return result;
  },

  // E0069 and E0070: where focus lands when the result closes, with the drawer open and folded.
  'ai-focus-after-close': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const held = heldReply(AI_REPLIES.picture());
      await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture(), held.reply] });
      await aiReady(s, { customize: false });
      await expandDrawer(s);
      await wand(s).click();
      await s.page.waitForTimeout(3500);
      await cardButton(s, /^Close$/);
      const drawerOpen = (await ai(s)).focus;
      await wand(s).click();
      await s.page.waitForTimeout(1500);
      await cardButton(s, /Keep drawing while you wait/);
      await collapseDrawer(s);
      held.release();
      await s.page.waitForTimeout(3500);
      await cardButton(s, /Your picture is/);
      await s.page.waitForTimeout(1500);
      await cardButton(s, /^Close$/);
      return { drawerOpen, drawerFolded: (await ai(s)).focus };
    }),

  // B0254 and E0023: the badge a returning visitor sees before this launch's grant answers.
  'ai-badge-before-grant': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const held = heldReply(() => ({ status: 200, json: { ok: true, remaining: 7, limit: 10 } }));
      const log = await installAiFixture(s.ctx, {
        '/api/free-generation-grant': [
          () => ({ status: 200, json: { ok: true, remaining: 7, limit: 10 } }),
          held.reply,
        ],
      });
      await aiReady(s);
      await expandDrawer(s);
      const firstLaunch = (await ai(s)).wand;
      await s.page.reload();
      await s.page.locator(s.paper).waitFor({ state: 'visible' });
      await s.page.waitForTimeout(1500);
      await expandDrawer(s);
      const beforeGrant = (await ai(s)).wand;
      const shot = await capture(s, `ai-badge-before-grant-${s.arm}`);
      held.release();
      await s.page.waitForTimeout(2000);
      return {
        firstLaunch,
        beforeGrant,
        shot,
        afterGrant: (await ai(s)).wand,
        grants: log.filter((entry) => entry.path === '/api/free-generation-grant').length,
      };
    }),

  // B0269: a run in flight when the page reloads.
  'ai-reload-mid-run': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.hang, AI_REPLIES.picture()],
      });
      await aiReady(s, { customize: false });
      await tapWand(s);
      await s.page.waitForTimeout(1500);
      const running = await ai(s);
      await s.page.reload();
      await s.page.locator(s.paper).waitFor({ state: 'visible' });
      await s.page.waitForTimeout(3000);
      const afterReload = await ai(s);
      const shot = await capture(s, `ai-reload-mid-run-${s.arm}`);
      await expandDrawer(s);
      await wand(s)
        .click()
        .catch(() => {});
      await s.page.waitForTimeout(3500);
      return {
        running: running.dialogs,
        afterReload: { dialogs: afterReload.dialogs, polaroid: afterReload.polaroid },
        shot,
        nextTap: await ai(s),
        posts: log.filter((entry) => entry.path === '/api/generate-image').length,
      };
    }),

  // B0277: the allowance runs out on the server while the run is in flight.
  'ai-exhausted-mid-run': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [
          () => ({
            status: 403,
            json: {
              ok: false,
              code: 'FREE_GRANT_EXHAUSTED',
              error:
                'Your 10 free creations are used up. Add your own OpenAI key to keep creating.',
              remaining: 0,
            },
          }),
        ],
      });
      await aiReady(s, { customize: false });
      await tapWand(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      const state = await ai(s);
      const settingsText = await s.page.evaluate(() =>
        [...document.querySelectorAll('dialog[open], [role="dialog"]')]
          .filter((element) => element.checkVisibility())
          .map((element) => element.innerText.replace(/\s+/g, ' ').slice(0, 200))
      );
      return {
        state,
        settingsText,
        shot: await capture(s, `ai-exhausted-mid-run-${s.arm}`),
        requests: summary(log),
      };
    }),

  // E0020 and E0024: the AI button joins the open drawer without moving it, and never shows with
  // the drawer closed.
  'ai-drawer-button': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      await installAiFixture(s.ctx);
      const boxes = () =>
        s.page.evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter(
              (element) =>
                element.checkVisibility() &&
                /Undo|Save screenshot|Coloring books|Brushes|Stroke width|AI image|Collapse controls/.test(
                  element.getAttribute('aria-label') ?? ''
                )
            )
            .map((element) => {
              const r = element.getBoundingClientRect();
              return `${element.getAttribute('aria-label')}@${Math.round(r.x)},${Math.round(r.y)}`;
            })
        );
      await boot(s);
      await expandDrawer(s);
      const withoutAi = await boxes();
      await collapseDrawer(s);
      await openSettings(s);
      await openSection(s, 'AI Art');
      await setSwitch(s, 'Create AI Images', true);
      await closeDialogs(s);
      await s.page.waitForTimeout(1500);
      const closedDrawerWand = (await ai(s)).wand;
      await expandDrawer(s);
      return {
        withoutAi,
        closedDrawerWand,
        withAi: await boxes(),
        shot: await capture(s, `ai-drawer-button-${s.arm}`),
      };
    }),

  // E0060: a report send that never answers.
  'ai-report-hangs': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const log = await installAiFixture(s.ctx, {
        '/api/generate-image': [AI_REPLIES.picture()],
        '/api/report-image': [AI_REPLIES.hang],
      });
      await aiReady(s, { customize: false });
      await tapWand(s);
      await s.page.waitForTimeout(PICTURE_WAIT_MS);
      await cardButton(s, /Report this picture/);
      await cardButton(s, /^Send|^Report$|Yes/);
      const marks = {};
      for (const atS of [10, 45]) {
        await s.page.waitForTimeout(atS === 10 ? 8500 : 35_000);
        marks[`${atS}s`] = await s.page.evaluate(() =>
          [...document.querySelectorAll('dialog[open], [role="dialog"]')]
            .filter((element) => element.checkVisibility())
            .map((element) => element.innerText.replace(/\s+/g, ' ').slice(-160))
        );
      }
      return { marks, shot: await capture(s, `ai-report-hangs-${s.arm}`), requests: summary(log) };
    }),

  // E0049: the polaroid tapped while the run is still going shows the run, not a picture.
  'ai-polaroid-mid-run': (browser) =>
    onBothArms(browser, 'iphone', async (s) => {
      const held = heldReply(AI_REPLIES.picture());
      await installAiFixture(s.ctx, { '/api/generate-image': [held.reply] });
      await aiReady(s, { customize: false });
      await tapWand(s);
      await s.page.waitForTimeout(1500);
      await cardButton(s, /Keep drawing while you wait/);
      await s.page.waitForTimeout(2000);
      const reopened = await cardButton(s, /Your picture is/);
      const state = await ai(s);
      const shot = await capture(s, `ai-polaroid-mid-run-${s.arm}`);
      held.release();
      return { reopened, state: { dialogs: state.dialogs, text: state.text }, shot };
    }),

  // WEB-CONTRACT abandoned-credential security: plaintext AI credentials an older web build left
  // in localStorage, met by this build's first launch.
  'ai-legacy-plaintext-credentials': (browser) =>
    onBothArms(
      browser,
      'desktop',
      async (s) => {
        await installAiFixture(s.ctx);
        await boot(s);
        await s.page.waitForTimeout(3000);
        return {
          remaining: await s.page.evaluate(() =>
            ['splotch-ai-user-api-key', 'splotch-ai-access-token'].filter(
              (key) => localStorage.getItem(key) !== null
            )
          ),
        };
      },
      {
        initScripts: [
          () => {
            if (sessionStorage.getItem('parity-seeded')) return;
            sessionStorage.setItem('parity-seeded', '1');
            localStorage.setItem(
              'splotch-ai-user-api-key',
              'sk-proj-legacyplaintext000000000000000000000000'
            );
            localStorage.setItem('splotch-ai-access-token', 'legacy-access-code');
          },
        ],
      }
    ),
};
