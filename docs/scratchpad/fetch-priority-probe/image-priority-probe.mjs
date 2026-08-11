// Frozen evidence for issue #892 — the API's behavior on its own, with no app
// around it: what initial priority does Chromium assign a detached `Image()`
// request, does `fetchPriority` move it, and does assignment order matter?
// See ../fetch-priority-prefetch-eval-2026-08.md, "What the hint does to a
// detached image".
//
//   node docs/scratchpad/fetch-priority-probe/image-priority-probe.mjs
//
// Run from the repo root (it resolves Playwright from the root node_modules).
// It needs no build and no app — one throwaway server, seven image requests,
// priorities read off CDP `Network.requestWillBeSent`.
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const page_html = `<!doctype html><meta charset=utf-8><title>prio</title>
<script>
window.go = () => {
  const mk = (name, apply) => {
    const img = new Image();
    img.decoding = 'async';
    apply?.(img, name);
    return img;
  };
  // a: current production shape (no hint)
  mk('a').src = '/img/a.png?case=detached-default';
  // b: hint set before src
  { const i = mk('b'); i.fetchPriority = 'low'; i.src = '/img/b.png?case=detached-low-before-src'; }
  // c: hint set after src
  { const i = mk('c'); i.src = '/img/c.png?case=detached-low-after-src'; i.fetchPriority = 'low'; }
  // d: high before src (the shipped selected-overlay shape)
  { const i = mk('d'); i.fetchPriority = 'high'; i.src = '/img/d.png?case=detached-high-before-src'; }
  // e: responsive detached (srcset+sizes) with low
  { const i = mk('e'); i.fetchPriority = 'low'; i.sizes = '100px'; i.srcset = '/img/e1.png?case=detached-low-srcset 240w'; i.src = '/img/e.png?case=detached-low-srcset-src'; }
  // f: in-document img, no hint
  { const i = mk('f'); i.src = '/img/f.png?case=dom-default'; document.body.append(i); }
  // g: in-document img, low
  { const i = mk('g'); i.fetchPriority = 'low'; i.src = '/img/g.png?case=dom-low'; document.body.append(i); }
};
</script>`;

const server = createServer((req, res) => {
  if (req.url.startsWith('/img/')) {
    res.writeHead(200, {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    });
    res.end(PNG);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page_html);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const seen = [];
await cdp.send('Network.enable');
cdp.on('Network.requestWillBeSent', (e) => {
  if (!e.request.url.includes('/img/')) return;
  seen.push({
    url: new URL(e.request.url).searchParams.get('case'),
    priority: e.request.initialPriority,
  });
});
await page.goto(base);
await page.evaluate('window.go()');
await page.waitForTimeout(1500);
console.log(JSON.stringify(seen, null, 2));
console.log('userAgent:', await page.evaluate('navigator.userAgent'));
console.log('supported:', await page.evaluate("'fetchPriority' in HTMLImageElement.prototype"));
await browser.close();
server.close();
