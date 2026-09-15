// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every `web/src/lib/state/*.svelte.ts` names its exported reactive singleton after the module
// basename plus a kind suffix: a `$state(...)` object or a `createX()` instance is `<basename>State`,
// a modal controller ends in `Modal`. The rule is mechanical so that this guard, not review, is
// what enforces the convention (issue #564; the prose lives in `.claude/rules/svelte.md` and
// `web/src/.ruler/AGENTS.md`).
const repoRoot = join(import.meta.dirname, '..', '..');
const stateDir = join(repoRoot, 'web', 'src', 'lib', 'state');
const RUNE_MODULE_SUFFIX = '.svelte.ts';

const EXPORTED_DECLARATION =
  /^export const (\w+)(?:\s*:[^\n]*?)?\s*=\s*(?:\$state(?:\.raw)?|create[A-Z]\w*)/gm;

// A type argument may sit between the initializer and its call — `$state<Settings>(` or
// `$state<Record<string, () => void>>(` — so the call is found by a balanced angle-bracket scan
// that ignores the `>` of an arrow, rather than by a character class that stops at `(`.
const callFollows = (source, from) => {
  let index = from;
  if (source[index] === '<') {
    let depth = 0;
    for (; index < source.length; index++) {
      if (source[index] === '<') depth++;
      else if (source[index] === '>' && source[index - 1] !== '=') {
        depth--;
        if (depth === 0) {
          index++;
          break;
        }
      }
    }
  }
  while (/\s/.test(source[index] ?? '')) index++;
  return source[index] === '(';
};

const exportedSingletons = (source) =>
  Array.from(source.matchAll(EXPORTED_DECLARATION))
    .filter((match) => callFollows(source, match.index + match[0].length))
    .map((match) => match[1]);

const expectedStateName = (file) => `${basename(file, RUNE_MODULE_SUFFIX)}State`;

// A module that holds a second reactive singleton names it basename + noun + `State`. Only
// `parentalGate.svelte.ts` does; issue #1920 may fold the policies into `parentalGateState`, and
// this entry leaves with them.
const SECOND_SINGLETONS = { 'parentalGate.svelte.ts': ['parentalGatePoliciesState'] };

const conforms = (file, name) =>
  name === expectedStateName(file) ||
  name.endsWith('Modal') ||
  (SECOND_SINGLETONS[file] ?? []).includes(name);

const violations = (file, source) =>
  exportedSingletons(source).filter((name) => !conforms(file, name));

describe('the state-module export naming rule', () => {
  it('accepts the basename plus State', () => {
    expect(violations('settings.svelte.ts', 'export const settingsState = $state({});')).toEqual(
      []
    );
  });

  it('accepts a typed binding and a createX() instance', () => {
    expect(
      violations(
        'aiProgress.svelte.ts',
        'export const aiProgressState: AiProgress = createAiProgress(aiGenerationState);'
      )
    ).toEqual([]);
  });

  it('accepts a modal controller ending in Modal', () => {
    expect(violations('ui.svelte.ts', 'export const settingsModal = createModal();')).toEqual([]);
  });

  it('rejects the bare module noun', () => {
    expect(violations('settings.svelte.ts', 'export const settings = $state({});')).toEqual([
      'settings',
    ]);
  });

  it('rejects a State name that is not the module basename', () => {
    expect(violations('strokeWidth.svelte.ts', 'export const strokeState = $state({});')).toEqual([
      'strokeState',
    ]);
  });

  it('rejects a typed $state<T>() initializer under the bare noun', () => {
    expect(
      violations('settings.svelte.ts', 'export const settings = $state<Settings>({});')
    ).toEqual(['settings']);
  });

  it('rejects a typed $state.raw<T>() initializer under the wrong name', () => {
    expect(
      violations('layout.svelte.ts', 'export const layout = $state.raw<LayoutState>({});')
    ).toEqual(['layout']);
  });

  it('rejects a type argument that contains parentheses', () => {
    expect(
      violations(
        'settings.svelte.ts',
        'export const settings = $state<Record<string, () => void>>({});'
      )
    ).toEqual(['settings']);
  });

  it('rejects a generic createX() instance whose type argument contains parentheses', () => {
    expect(
      violations(
        'aiProgress.svelte.ts',
        'export const aiProgress = createAiProgress<(() => void) | null>(aiGenerationState);'
      )
    ).toEqual(['aiProgress']);
  });

  it('accepts a function-typed annotation under the right name', () => {
    expect(
      violations('network.svelte.ts', 'export const networkState: () => void = $state(noop);')
    ).toEqual([]);
  });

  it('accepts a typed initializer under the right name', () => {
    expect(
      violations('layout.svelte.ts', 'export const layoutState = $state.raw<LayoutState>({});')
    ).toEqual([]);
  });

  it('rejects an exported $state.raw under the wrong name', () => {
    expect(violations('layout.svelte.ts', 'export const viewport = $state.raw({});')).toEqual([
      'viewport',
    ]);
  });

  it('ignores private module-scope state and exported functions', () => {
    expect(
      violations(
        'appearance.svelte.ts',
        ['const appearance = $state({});', 'export function resolvedTheme() {}'].join('\n')
      )
    ).toEqual([]);
  });
});

describe('web/src/lib/state', () => {
  const runeModules = readdirSync(stateDir).filter((file) => file.endsWith(RUNE_MODULE_SUFFIX));
  const found = Object.fromEntries(
    runeModules.map((file) => [
      file,
      exportedSingletons(readFileSync(join(stateDir, file), 'utf8')),
    ])
  );

  it('still exposes singletons the matcher can see, so the rule cannot pass vacuously', () => {
    expect(found['settings.svelte.ts']).toEqual(['settingsState']);
    expect(found['ui.svelte.ts']).toContain('uiState');
    expect(found['ui.svelte.ts']).toContain('settingsModal');
  });

  it('keeps the parentalGate second-singleton exception honest', () => {
    expect(found['parentalGate.svelte.ts']).toEqual([
      'parentalGatePoliciesState',
      'parentalGateState',
    ]);
  });

  it('names every exported reactive singleton after its module', () => {
    const offenders = Object.entries(found).flatMap(([file, names]) =>
      names.filter((name) => !conforms(file, name)).map((name) => `${file}: ${name}`)
    );
    expect(offenders).toEqual([]);
  });
});
