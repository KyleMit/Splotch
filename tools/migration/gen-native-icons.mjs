import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { iconTokenEntries } from '../../web/src/lib/design/iconTokens.ts';
import { brand, themes, toCssVarName } from '../../web/src/lib/design/tokens.ts';
import { NON_RENDERABLE_ICONS, iconNameFromPath } from '../../web/src/lib/components/iconTypes.ts';
import { ROOT, isMain } from '../lib/proc.mjs';

const ICON_DIR = `${ROOT}/web/src/lib/icons/`;
const DEFERRED_SUBDIR = 'deferred/';
const SHIPPING_ICON_COMPONENT = `${ROOT}/web/src/lib/components/Icon.svelte`;
const NATIVE_ICON_DIR = `${ROOT}/experiments/native-architecture/src/rsdDrawing/`;
export const NATIVE_ICONS_TARGET = `${NATIVE_ICON_DIR}icons.generated.ts`;
export const NATIVE_DEFERRED_ICONS_TARGET = `${NATIVE_ICON_DIR}icons.deferred.generated.ts`;
export const NATIVE_SPLOTCHY_TARGET = `${NATIVE_ICON_DIR}splotchy.generated.ts`;
// SectionIcon.svelte routes this one non-renderable icon to SplotchyIcon.svelte.
const SPLOTCHY = 'splotchy';
const DEFERRED_SPECIFIER = `./${basename(NATIVE_DEFERRED_ICONS_TARGET, '.ts')}`;

// The icons the drawing screen mounts with, painted or one press away: More colors and the folded
// palette's ink, the Clear control with its coachmark, the settings gear, the drawer toggle, and
// the Fullscreen Toggle a phone browser shows in the corner. Every other shipping icon ships in
// the lazily imported deferred module, as ADR-0164 keeps web/src/lib/icons/deferred/ off the
// shipping startup path; the web export prewarms it in the background after first paint, and a
// sheet opens with it (ADR-0179).
export const NATIVE_STARTUP_ICONS = [
  'more-colors',
  'ink-splotch',
  'trash-closed',
  'trash-open',
  'swipe-down',
  'settings',
  'chevron-right',
  'fullscreen',
  'fullscreen-exit',
];

const THEMES = ['light', 'dark'];
const SVG_SUFFIX = '.svg';
const ROOT_TAG = /^<svg\b[^>]*>/;
const ROOT_FILL = / fill="([^"]*)"/;
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
const CURRENT_COLOR = 'currentColor';
const STYLE_ATTRIBUTE = /style="([^"]*)"/g;
const VAR_REFERENCE = /^var\((--[a-z0-9-]+),(#[0-9a-f]{3,8})\)$/;
const TAG = /<[a-zA-Z][^>]*>/g;
const ATTRIBUTE_NAME = /\s([a-zA-Z:-]+)="/g;
const COLOR_ICON_SET = /export const COLOR_ICONS = new Set<CommonIconName>\(\[([\s\S]*?)\]\);/;
const LINE_COMMENT = /\/\/.*$/gm;
const QUOTED_NAME = /'([a-z0-9-]+)'/g;

// Every icon <Icon> renders, by name: the eager set beside the deferred subdirectory, without
// the structural icons iconTypes.ts excludes.
export function shippingIconFiles(iconDir = ICON_DIR) {
  const svgs = (dir) => readdirSync(`${iconDir}${dir}`).filter((file) => file.endsWith(SVG_SUFFIX));
  const files = [
    ...svgs(''),
    ...svgs(DEFERRED_SUBDIR).map((file) => `${DEFERRED_SUBDIR}${file}`),
  ].filter((file) => !NON_RENDERABLE_ICONS.includes(iconNameFromPath(file)));
  return new Map(
    files
      .map((file) => [iconNameFromPath(file), file])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
}

// Icon.svelte's COLOR_ICONS: the icons the shipping app never re-inks with --icon-ink.
export function shippingColorIcons(source = readFileSync(SHIPPING_ICON_COMPONENT, 'utf8')) {
  const block = COLOR_ICON_SET.exec(source)?.[1];
  if (!block) throw new Error('Icon.svelte no longer declares COLOR_ICONS as a literal set.');
  return new Set(
    [...block.replace(LINE_COMMENT, '').matchAll(QUOTED_NAME)].map((match) => match[1])
  );
}

// The CSS custom properties an icon may paint with, as each theme resolves them.
function themeVars(theme) {
  return new Map([
    ...Object.entries(brand).map(([key, value]) => [toCssVarName(key), value]),
    ...Object.entries(themes[theme]).map(([key, value]) => [toCssVarName(key), value]),
    ...iconTokenEntries().map((entry) => [entry.cssVar, entry[theme]]),
  ]);
}

const THEME_VARS = Object.fromEntries(THEMES.map((theme) => [theme, themeVars(theme)]));

function resolvedValue(name, value, theme) {
  const reference = VAR_REFERENCE.exec(value);
  if (!reference) return value;
  const [, cssVar, fallback] = reference;
  if (!THEME_VARS[theme].has(cssVar) || THEME_VARS.light.get(cssVar) !== fallback)
    throw new Error(`Unresolved icon token ${cssVar} in ${name}`);
  return THEME_VARS[theme].get(cssVar);
}

// The shipping SVGs paint themed parts through inline style; react-native-svg resolves no CSS
// custom properties, so each declaration becomes the presentation attribute it sets.
function presentationAttributes(name, declarations, theme) {
  return declarations
    .split(';')
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      const property = declaration.slice(0, separator).trim();
      const value = resolvedValue(name, declaration.slice(separator + 1).trim(), theme);
      return `${property}="${value}"`;
    })
    .join(' ');
}

// Shipping re-inks a monochrome glyph by setting fill on its <svg>, which reaches every part
// without a fill of its own; the native renderer resolves currentColor from the caller instead.
function reinkedRoot(name, svg) {
  const root = ROOT_TAG.exec(svg)?.[0];
  if (!root) throw new Error(`No <svg> root in native icon ${name}`);
  const fill = ROOT_FILL.exec(root)?.[1];
  if (fill === CURRENT_COLOR) return svg;
  if (fill === undefined) return svg.replace(XMLNS, `${XMLNS} fill="${CURRENT_COLOR}"`);
  if (fill !== themes.light.iconInk)
    throw new Error(`Monochrome icon ${name} bakes ${fill}, not the light icon ink`);
  return svg.replace(root, root.replace(ROOT_FILL, ` fill="${CURRENT_COLOR}"`));
}

function assertNativeMarkup(name, markup) {
  if (/var\(|style=|<style|class=/.test(markup))
    throw new Error(`Unsupported styling in native icon ${name}`);
  for (const [tag] of markup.matchAll(TAG)) {
    const attributes = [...tag.matchAll(ATTRIBUTE_NAME)].map((match) => match[1]);
    if (new Set(attributes).size !== attributes.length)
      throw new Error(`Duplicate attribute in native icon ${name}: ${tag.slice(0, 60)}`);
  }
}

export function themedIcon(name, svg, theme, { colorIcon }) {
  const styled = svg.replace(STYLE_ATTRIBUTE, (_, declarations) =>
    presentationAttributes(name, declarations, theme)
  );
  const themed = colorIcon ? styled : reinkedRoot(name, styled);
  assertNativeMarkup(name, themed);
  return themed;
}

function constName(name, suffix = '') {
  return `${name.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase())}${suffix}`;
}

function iconTable(names, files, colorIcons, iconDir) {
  const declarations = [];
  const entries = [];
  for (const name of names) {
    const file = files.get(name);
    if (!file) throw new Error(`No shipping icon named ${name}`);
    const svg = readFileSync(`${iconDir}${file}`, 'utf8').trim();
    const [light, dark] = THEMES.map((theme) =>
      themedIcon(name, svg, theme, { colorIcon: colorIcons.has(name) })
    );
    if (light === dark) {
      declarations.push(`const ${constName(name)} = ${JSON.stringify(light)};`);
      entries.push(`'${name}': { light: ${constName(name)}, dark: ${constName(name)} },`);
    } else {
      declarations.push(`const ${constName(name, 'Light')} = ${JSON.stringify(light)};`);
      declarations.push(`const ${constName(name, 'Dark')} = ${JSON.stringify(dark)};`);
      entries.push(
        `'${name}': { light: ${constName(name, 'Light')}, dark: ${constName(name, 'Dark')} },`
      );
    }
  }
  return { declarations, entries };
}

const MARKUP_TYPE = "Record<string, Record<'light' | 'dark', string>>";

function header(source) {
  return `// Generated by tools/migration/gen-native-icons.mjs from ${source}; do not edit.`;
}

export function nativeIconModules({
  startup = NATIVE_STARTUP_ICONS,
  iconDir = ICON_DIR,
  colorIcons = shippingColorIcons(),
} = {}) {
  if (NON_RENDERABLE_ICONS.length !== 1 || NON_RENDERABLE_ICONS[0] !== SPLOTCHY)
    throw new Error('SectionIcon dispatch only knows splotchy; port the new structural icon.');
  const files = shippingIconFiles(iconDir);
  const deferred = [...files.keys()].filter((name) => !startup.includes(name));
  const eager = iconTable(startup, files, colorIcons, iconDir);
  const lazy = iconTable(deferred, files, colorIcons, iconDir);
  const splotchy = readFileSync(`${iconDir}${SPLOTCHY}${SVG_SUFFIX}`, 'utf8').trim();
  assertNativeMarkup(SPLOTCHY, splotchy);
  return {
    [NATIVE_ICONS_TARGET]: [
      header('web/src/lib/icons'),
      '',
      `import type { NATIVE_DEFERRED_ICONS } from '${DEFERRED_SPECIFIER}';`,
      '',
      ...eager.declarations,
      '',
      `export const NATIVE_ICONS = {\n${eager.entries.join('\n')}\n} as const satisfies ${MARKUP_TYPE};`,
      '',
      `export const SPLOTCHY_ICON_NAME = '${SPLOTCHY}';`,
      '',
      "export type NativeIconMarkup = Record<'light' | 'dark', string>;",
      'export type NativeStartupIconName = keyof typeof NATIVE_ICONS;',
      'export type NativeDeferredIconName = keyof typeof NATIVE_DEFERRED_ICONS;',
      'export type NativeIconName = NativeStartupIconName | NativeDeferredIconName;',
      '',
    ].join('\n'),
    [NATIVE_DEFERRED_ICONS_TARGET]: [
      header('web/src/lib/icons'),
      '',
      ...lazy.declarations,
      '',
      `export const NATIVE_DEFERRED_ICONS = {\n${lazy.entries.join('\n')}\n} as const satisfies ${MARKUP_TYPE};`,
      '',
    ].join('\n'),
    [NATIVE_SPLOTCHY_TARGET]: [
      header(`web/src/lib/icons/${SPLOTCHY}${SVG_SUFFIX}`),
      '',
      `export const NATIVE_SPLOTCHY = ${JSON.stringify(splotchy)};`,
      '',
    ].join('\n'),
  };
}

export async function generateNativeIcons(argv, modules = nativeIconModules()) {
  if (argv.some((arg) => arg !== '--check')) throw new Error('Only --check is supported.');
  const drifted = [];
  for (const [target, source] of Object.entries(modules)) {
    const content = await format(source, {
      ...(await resolveConfig(target)),
      filepath: target,
    });
    if (!argv.includes('--check')) writeFileSync(target, content);
    else if (readFileSync(target, 'utf8') !== content)
      drifted.push(target.slice(NATIVE_ICON_DIR.length));
  }
  if (drifted.length) throw new Error(`Native icon drift: ${drifted.join(', ')}`);
  const deferred = shippingIconFiles().size - NATIVE_STARTUP_ICONS.length;
  return { startup: NATIVE_STARTUP_ICONS.length, deferred };
}

if (isMain(import.meta.url))
  console.log(JSON.stringify(await generateNativeIcons(process.argv.slice(2))));
