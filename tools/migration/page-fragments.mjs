// A prerendered page document's fragment targets (prerender-native-web-pages.mjs): the keyed ids
// each layout variant carries, and the canonical targets a document without a script adds outside
// them.
import {
  DESIGN_PAGE_SCROLLER_TEST_ID,
  INFORMATION_PAGE_SCROLLER_TEST_ID,
} from '../../src/rsdDrawing/pageFrame.ts';

// Every variant carries the page's fragment targets (its section ids), and a browser follows a
// fragment to the first element with that id, which without a script is usually a hidden variant.
// So each variant's targets, and the in-page links to them, carry the variant's key; the boot script
// strips it from the variant it keeps before hydration, so the hydrated markup is the page's own.
export const VARIANT_FRAGMENT_SEPARATOR = '~';

// A page's fragment targets: each id an in-page link names, in document order.
function fragmentTargets(html) {
  const linked = new Set([...html.matchAll(/ href="#([^"]+)"/g)].map((match) => match[1]));
  return new Set(
    [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]).filter((id) => linked.has(id))
  );
}

export function withVariantFragments(html, key) {
  const targets = fragmentTargets(html);
  const suffix = `${VARIANT_FRAGMENT_SEPARATOR}${key}`;
  return html
    .replace(/ id="([^"]+)"/g, (attribute, id) =>
      targets.has(id) ? ` id="${id}${suffix}"` : attribute
    )
    .replace(/ href="#([^"]+)"/g, (attribute, id) =>
      targets.has(id) ? ` href="#${id}${suffix}"` : attribute
    );
}

// A canonical section URL (/privacy#contact, the footer's /changelog#release-…) names no keyed
// target, and a duplicate of the id inside each variant would not help: a browser follows a
// fragment to the first element with that id in tree order, shown or not, and each variant
// scrolls its own scroller. So without a script a document with section links lets the window
// scroll in place of the page's scroller, and carries one canonical target per section outside
// the variants, which anchor positioning sets at its section in whichever variant shows. Each
// target takes its section's scroll margin. With a script none of it is parsed (the targets sit in
// a <noscript>), and an engine without anchor positioning keeps the page as it was, opening such
// a URL at the top.
export const PAGE_FRAGMENT_ATTRIBUTE = 'data-page-fragment';
const PAGE_SCROLLERS = [INFORMATION_PAGE_SCROLLER_TEST_ID, DESIGN_PAGE_SCROLLER_TEST_ID]
  .map((id) => `[data-testid=${id}]`)
  .join(',');
const SCROLL_MARGIN_CLASS = /\.([\w-]+)(?:\.\1)*\{scroll-margin-top:/g;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Each canonical target: its id and the classes on its section that set a scroll margin.
export function canonicalFragments(html, css) {
  const margins = new Set([...css.matchAll(SCROLL_MARGIN_CLASS)].map((match) => match[1]));
  return [...fragmentTargets(html)].map((id) => {
    const tag = html.match(new RegExp(`<[^>]*\\sid="${escapeRegExp(id)}"[^>]*>`))?.[0] ?? '';
    const classes = (/\sclass="([^"]*)"/.exec(tag)?.[1] ?? '')
      .split(/\s+/)
      .filter((name) => margins.has(name));
    return { id, classes };
  });
}

// The document's canonical targets, as the lines of markup that follow its variants.
export function canonicalFragmentMarkup(fragments) {
  if (fragments.length === 0) return [];
  const targets = fragments.map(
    ({ id, classes }) =>
      `<span ${PAGE_FRAGMENT_ATTRIBUTE} id="${id}"${classes.length ? ` class="${classes.join(' ')}"` : ''}></span>`
  );
  return [`<noscript>${targets.join('')}</noscript>`];
}

export function canonicalFragmentCss(fragments, variantAttribute) {
  if (fragments.length === 0) return '';
  const target = `[${PAGE_FRAGMENT_ATTRIBUTE}]`;
  const anchors = fragments.map(
    ({ id }, index) =>
      `[id^="${id}${VARIANT_FRAGMENT_SEPARATOR}"]{anchor-name:--f${index}}[id="${id}"]{top:anchor(--f${index} top)}`
  );
  return [
    `${target}{display:none}@supports (anchor-name:--f){`,
    'html,html body{height:auto;overflow:visible}',
    `html [${variantAttribute}]{height:auto;min-height:100vh}`,
    `html :is(${PAGE_SCROLLERS}){height:auto;overflow:visible;overflow-x:clip}`,
    `${target}${target}{display:block;position:absolute;left:0;width:0;height:0}`,
    ...anchors,
    '}',
  ].join('');
}
