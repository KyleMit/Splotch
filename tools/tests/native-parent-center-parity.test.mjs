import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PARENT_FEATURES,
  PARENT_MODES,
  endsParentCenterProtection,
  isParentModeAvailable,
} from '../../experiments/native-architecture/src/parentCenter/parentPolicy.ts';
import {
  PARENT_CENTER_COPY,
  PARENT_HELP,
  PARENT_LABELS,
  PARENT_MODE_LABELS,
} from '../../experiments/native-architecture/src/parentCenter/parentCenterCopy.ts';
import { PARENT_GATE_COPY } from '../../experiments/native-architecture/src/parentCenter/parentGateCopy.ts';
import {
  PARENT_GATE_ERROR_MESSAGE,
  PARENT_GATE_SUCCESS_HOLD_MS,
} from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import {
  POLICY_COPY_MIN_PX,
  POLICY_MATRIX_MIN_WIDTH_PX,
  POLICY_MODES_COLUMN_PX,
} from '../../experiments/native-architecture/src/parentCenter/parentCenterMetrics.ts';
import {
  PARENT_GATE_KEYPAD_METRICS,
  PARENT_GATE_METRICS,
} from '../../experiments/native-architecture/src/parentCenter/parentGateMetrics.ts';
import { scale } from '../../web/src/lib/design/tokens.ts';

const web = (path) => readFileSync(new URL(`../../web/src/${path}`, import.meta.url), 'utf8');
const SHIPPING = {
  state: web('lib/state/parentalGate.svelte.ts'),
  section: web('lib/components/settings/ParentCenterSection.svelte'),
  lock: web('lib/components/settings/ParentCenterLock.svelte'),
  gate: web('lib/components/ParentalGate.svelte'),
  footer: web('lib/components/ParentalGateManageFooter.svelte'),
};
// The native policy record names shipping's `aiImage` feature `ai`.
const SHIPPING_FEATURE = { ai: 'aiImage' };
const shippingFeature = (feature) => SHIPPING_FEATURE[feature] ?? feature;

// Markup text as a reader sees it: tags dropped, whitespace runs collapsed.
const visible = (markup) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const between = (source, start, end) => {
  const from = source.indexOf(start);
  if (from === -1) throw new Error(`No ${start}`);
  return source.slice(from + start.length, source.indexOf(end, from + start.length));
};
// A string literal, single- or double-quoted, as the TypeScript source spells it.
const literal = (text) => (text.includes("'") ? JSON.stringify(text) : `'${text}'`);

describe('Parent Center policies against parentalGate.svelte.ts', () => {
  it('lists the shipping protections and modes in the shipping order', () => {
    const features = between(SHIPPING.state, 'PARENTAL_GATE_FEATURES = [', ']')
      .match(/'(\w+)'/g)
      .map((quoted) => quoted.slice(1, -1));
    expect(PARENT_FEATURES.map(shippingFeature)).toEqual(features);
    const modes = between(SHIPPING.state, 'PARENTAL_GATE_MODES = [', ']')
      .match(/'(\w+)'/g)
      .map((quoted) => quoted.slice(1, -1));
    expect([...PARENT_MODES]).toEqual(modes);
  });

  it('takes Never off external links on iOS alone, as isParentalGateModeAvailable does', () => {
    expect(SHIPPING.state).toContain(
      "return !(feature === 'externalLinks' && mode === 'never' && platform === 'ios');"
    );
    for (const platform of ['ios', 'android', 'web'])
      for (const feature of PARENT_FEATURES)
        for (const mode of PARENT_MODES)
          expect(isParentModeAvailable(feature, mode, platform), `${feature} ${mode}`).toBe(
            !(feature === 'externalLinks' && mode === 'never' && platform === 'ios')
          );
  });

  it('asks before Never on Parent Center and nothing else', () => {
    for (const feature of PARENT_FEATURES)
      for (const mode of PARENT_MODES)
        expect(endsParentCenterProtection(feature, mode)).toBe(
          feature === 'parentCenter' && mode === 'never'
        );
  });

  it('holds success and words a wrong answer as shipping does', () => {
    expect(SHIPPING.state).toContain(
      `export const GATE_SUCCESS_HOLD_MS = ${PARENT_GATE_SUCCESS_HOLD_MS};`
    );
    expect(SHIPPING.state).toContain(
      `export const GATE_ERROR_MESSAGE = ${literal(PARENT_GATE_ERROR_MESSAGE)};`
    );
  });
});

describe('Parent Center copy against ParentCenterSection.svelte', () => {
  it('names and explains each protection as shipping does', () => {
    for (const feature of PARENT_FEATURES) {
      const entry = between(SHIPPING.section, `    ${shippingFeature(feature)}: {`, '},');
      expect(entry, feature).toContain(`label: ${literal(PARENT_LABELS[feature])},`);
      expect(entry, feature).toContain(`help: ${literal(PARENT_HELP[feature])},`);
    }
  });

  it('labels the modes as shipping does', () => {
    for (const mode of PARENT_MODES)
      expect(SHIPPING.section).toContain(`${mode}: ${literal(PARENT_MODE_LABELS[mode])},`);
  });

  it('carries the intro, the notes, the confirmation and the footnotes word for word', () => {
    const markup = visible(SHIPPING.section);
    expect(markup).toContain(PARENT_CENTER_COPY.intro);
    expect(markup).toContain(
      `${PARENT_CENTER_COPY.unavailableTitle} ${PARENT_CENTER_COPY.unavailable}`
    );
    expect(markup).toContain(PARENT_CENTER_COPY.warningTitle);
    expect(markup).toContain(PARENT_CENTER_COPY.confirmTitle);
    expect(markup).toContain(PARENT_CENTER_COPY.keepOn);
    expect(markup).toContain(PARENT_CENTER_COPY.turnOff);
    expect(SHIPPING.section).toContain(`<span>${PARENT_CENTER_COPY.matrixHeading}</span>`);
    expect(markup).toContain(`${PARENT_MODE_LABELS.session} ${PARENT_CENTER_COPY.sessionNote}`);
    expect(markup).toContain(`${PARENT_MODE_LABELS.never} ${PARENT_CENTER_COPY.neverNote}`);
    expect(visible(between(SHIPPING.section, 'const UNPROTECTED_CONSEQUENCE =', ';'))).toBe(
      JSON.stringify(PARENT_CENTER_COPY.unprotected)
    );
  });

  it('locks the controls behind the ParentCenterLock copy', () => {
    const markup = visible(SHIPPING.lock);
    expect(markup).toContain(PARENT_CENTER_COPY.lock);
    expect(markup).toContain(PARENT_CENTER_COPY.unlock);
  });
});

describe('Grown-Ups Only copy against ParentalGate.svelte', () => {
  it('titles the card and its success as shipping does', () => {
    const markup = visible(SHIPPING.gate);
    for (const text of [
      PARENT_GATE_COPY.title,
      PARENT_GATE_COPY.unlocked,
      PARENT_GATE_COPY.unlockedSub,
    ])
      expect(markup).toContain(text);
    expect(SHIPPING.gate).toContain(`'${PARENT_GATE_COPY.managingSubtitle}'`);
    expect(SHIPPING.gate).toContain(`'${PARENT_GATE_COPY.subtitle}'`);
  });

  it('points at Settings › Parent Center from the footer', () => {
    expect(visible(SHIPPING.footer)).toContain(
      `${PARENT_GATE_COPY.manageLead} ${PARENT_GATE_COPY.managePlace} › ${PARENT_GATE_COPY.managePolicies}`
    );
  });
});

const MEASURED = {
  section: web('lib/components/settings/ParentCenterSection.svelte'),
  gate: web('lib/components/ParentalGate.svelte'),
  problem: web('lib/components/ParentalGateProblem.svelte'),
  keypad: web('lib/components/ParentalGateKeypad.svelte'),
  footer: web('lib/components/ParentalGateManageFooter.svelte'),
};
// The gate's media steps, as each shipping stylesheet spells them.
const STEP_QUERIES = {
  phoneLandscape: '@media (orientation: landscape) and (max-height: 599.98px)',
  tablet: '@media (min-width: 600px) and (min-height: 600px)',
  largeTablet: '@media (min-width: 1000px) and (min-height: 1000px)',
};
// A step takes whatever its own block leaves alone from the steps beneath it.
const STEP_FALLBACKS = {
  phone: [],
  phoneLandscape: ['phone'],
  tablet: ['phone'],
  largeTablet: ['tablet', 'phone'],
};
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function closingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}' && --depth === 0) return index;
  }
  throw new Error('Unclosed block');
}

// The <style> body outside every media query, or one step's media block.
function styleScope(source, step) {
  const style = source.slice(source.indexOf('<style>'));
  if (step !== 'phone') {
    const start = style.indexOf(STEP_QUERIES[step]);
    return start === -1 ? '' : style.slice(start, closingBrace(style, style.indexOf('{', start)));
  }
  let base = style;
  for (let start = base.indexOf('@media'); start !== -1; start = base.indexOf('@media'))
    base = base.slice(0, start) + base.slice(closingBrace(base, base.indexOf('{', start)) + 1);
  return base;
}

const TOKEN_LENGTH = /^var\(--(space|font-size)-(\w+)\)$/;
function length(value) {
  const token = TOKEN_LENGTH.exec(value);
  if (!token) return Number.parseFloat(value);
  const [, group, step] = token;
  const name = `${group === 'space' ? 'space' : 'fontSize'}${step[0].toUpperCase()}${step.slice(1)}`;
  return Number.parseFloat(scale[name]);
}

function declared(scope, selector, property) {
  const rule = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)} \\{([^}]*)\\}`).exec(scope);
  const value =
    rule && new RegExp(`(?:^|[;\\s])${escapeRegExp(property)}: ([^;]+);`).exec(rule[1])?.[1];
  return value === undefined || value === null ? undefined : length(value.trim());
}

function stepValue(source, step, selector, property) {
  for (const scope of [step, ...STEP_FALLBACKS[step]]) {
    const value = declared(styleScope(source, scope), selector, property);
    if (value !== undefined) return value;
  }
  throw new Error(`No ${selector} ${property} at ${step}`);
}

describe('Grown-Ups Only and Parent Center measures against shipping', () => {
  const steps = Object.keys(PARENT_GATE_METRICS);

  it.each(steps)('sizes the %s keypad as shipping does', (step) => {
    const metrics = PARENT_GATE_KEYPAD_METRICS[step];
    expect(stepValue(MEASURED.keypad, step, '.gate-key', 'height')).toBe(metrics.keyHeight);
    expect(stepValue(MEASURED.keypad, step, '.gate-keypad', 'gap')).toBe(metrics.gap);
    expect(stepValue(MEASURED.keypad, step, ':global(.gate-key-icon)', 'width')).toBe(metrics.icon);
    expect(stepValue(MEASURED.keypad, step, '.gate-key', 'font-size')).toBe(
      Number.parseFloat(metrics.digits === 'xl' ? scale.fontSizeXl : scale.fontSizeLg)
    );
  });

  it('narrows only the landscape keypad, beside the problem', () => {
    const narrowed = steps.filter((step) => PARENT_GATE_KEYPAD_METRICS[step].width !== null);
    expect(narrowed).toEqual(['phoneLandscape']);
    expect(stepValue(MEASURED.keypad, 'phoneLandscape', '.gate-keypad', 'width')).toBe(
      PARENT_GATE_KEYPAD_METRICS.phoneLandscape.width
    );
  });

  it.each(steps)('sizes the %s card, problem and footer as shipping does', (step) => {
    const metrics = PARENT_GATE_METRICS[step];
    expect(stepValue(MEASURED.gate, step, ':global(.gate-mascot)', 'width')).toBe(metrics.mascot);
    expect(stepValue(MEASURED.gate, step, '.gate-success', 'min-height')).toBe(
      metrics.successMinHeight
    );
    expect(stepValue(MEASURED.problem, step, '.gate-operand', 'width')).toBe(metrics.operand);
    expect(stepValue(MEASURED.problem, step, '.gate-dab', 'width')).toBe(metrics.dab.width);
    expect(stepValue(MEASURED.problem, step, '.gate-dab', 'height')).toBe(metrics.dab.height);
    expect(stepValue(MEASURED.problem, step, '.gate-equation', 'gap')).toBe(metrics.equationGap);
    expect(stepValue(MEASURED.problem, step, '.gate-error', 'height')).toBe(metrics.errorHeight);
    // The footer steps once, at the tablet floor; the landscape phone keeps the phone line.
    const footerStep = { phoneLandscape: 'phone', largeTablet: 'tablet' }[step] ?? step;
    expect(stepValue(MEASURED.footer, footerStep, ':global(.gate-manage-icon)', 'width')).toBe(
      metrics.footerIcon
    );
  });

  it('builds the policy matrix from the shipping columns', () => {
    expect(MEASURED.section).toContain(`--policy-copy-min: ${POLICY_COPY_MIN_PX}px;`);
    expect(MEASURED.section).toContain(`--policy-modes-column: ${POLICY_MODES_COLUMN_PX}px;`);
    expect(MEASURED.section).toContain(`@container (min-width: ${POLICY_MATRIX_MIN_WIDTH_PX}px)`);
  });
});
