import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

export const NATIVE_PRIVACY_PATH =
  'experiments/native-architecture/src/information/privacy.generated.json';
const compact = (text) => text.replace(/\s+/g, ' ').trim();

function inline(node, inherited = {}) {
  if (node.nodeType === 3) return [{ ...inherited, text: node.textContent.replace(/\s+/g, ' ') }];
  const format = { ...inherited };
  if (node.tagName === 'A') format.href = node.getAttribute('href');
  if (node.tagName === 'STRONG') format.strong = true;
  if (node.tagName === 'EM') format.italic = true;
  return [...node.childNodes].flatMap((child) => inline(child, format));
}

function paragraph(node) {
  const spans = inline(node).filter(({ text }) => text);
  if (spans.length) {
    spans[0].text = spans[0].text.trimStart();
    spans.at(-1).text = spans.at(-1).text.trimEnd();
  }
  return spans;
}

export function privacyContent(html) {
  const { document } = new Window();
  document.body.innerHTML = html;
  for (const chrome of document.querySelectorAll('.section-anchor, [data-external-mark]'))
    chrome.remove();
  return {
    title: compact(document.querySelector('h1').textContent),
    lede: compact(document.querySelector('.lede').textContent),
    updated: compact(document.querySelector('.policy-updated').textContent),
    highlights: [...document.querySelectorAll('.highlights li')].map((node) =>
      compact(node.textContent)
    ),
    sections: [...document.querySelectorAll('.sections section')].map((section) => ({
      id: section.id,
      title: compact(section.querySelector('h3').textContent),
      blocks: [...section.children].flatMap((node) => {
        if (node.tagName === 'P' || node.classList.contains('policy-ask'))
          return [{ kind: 'paragraph', spans: paragraph(node) }];
        if (node.tagName === 'UL')
          return [...node.children].map((item) => ({ kind: 'item', spans: paragraph(item) }));
        return [];
      }),
    })),
  };
}

async function renderPrivacy(native) {
  const { createServer } = await import('vite');
  const { svelte } = await import('@sveltejs/vite-plugin-svelte');
  const root = join(ROOT, 'web');
  const environment = {
    '$app/environment': 'export const browser=false,dev=false,building=true;',
    '$app/state': 'export const page={url:new URL("https://splotch.art/privacy")};',
    '$app/navigation': 'export const goto=()=>{},beforeNavigate=()=>{},afterNavigate=()=>{};',
  };
  const server = await createServer({
    root,
    configFile: false,
    plugins: [
      svelte({ compilerOptions: { dev: false } }),
      {
        name: 'privacy-server-environment',
        resolveId(id) {
          if (Object.hasOwn(environment, id)) return '\0' + id;
        },
        load(id) {
          return environment[id.slice(1)];
        },
      },
    ],
    resolve: {
      alias: {
        $lib: join(root, 'src/lib'),
        $nativePageParentCenter: join(
          root,
          'src/lib/components/page',
          native ? 'pageParentCenter.svelte.ts' : 'webPageParentCenter.ts'
        ),
        $pageIcon: join(
          root,
          'src/lib/components/page',
          native ? 'NativePageIcon.svelte' : 'WebPageIcon.svelte'
        ),
      },
    },
    define: { __IS_CAPACITOR__: String(native), __NATIVE_API_BASE__: '"https://splotch.art"' },
    server: { middlewareMode: true, ws: false, watch: null },
    appType: 'custom',
  });
  try {
    const { default: Page } = await server.ssrLoadModule('/src/routes/privacy/+page.svelte');
    const { render } = await server.ssrLoadModule('svelte/server');
    return privacyContent(render(Page).body);
  } finally {
    await server.close();
  }
}

export async function generateNativePrivacy(check = false) {
  const result = { native: await renderPrivacy(true), web: await renderPrivacy(false) };
  const output = JSON.stringify(result, null, 2) + '\n';
  const path = join(ROOT, NATIVE_PRIVACY_PATH);
  if (check) {
    if (readFileSync(path, 'utf8') !== output)
      throw new Error('Native privacy copy drifted; run npm run gen:native-privacy');
  } else writeFileSync(path, output);
}

if (isMain(import.meta.url)) runMain(() => generateNativePrivacy(process.argv.includes('--check')));
