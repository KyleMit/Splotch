import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GITHUB_REPO_URL } from '../../web/src/lib/githubRepo.ts';
import { HOSTED_PAGES } from '../../experiments/native-architecture/src/settings/hostedPages.ts';
import {
  MESSAGE_PROMPT_BY_KIND,
  REPORT_FORM_COPY,
} from '../../experiments/native-architecture/src/feedback/reportFormCopy.ts';
import { FEEDBACK_PAGE_COPY } from '../../experiments/native-architecture/src/information/feedbackPageCopy.ts';
import { WHATS_NEW_COPY } from '../../experiments/native-architecture/src/settings/whatsNew.ts';

vi.mock('react-native', () => ({ Linking: {} }));

// The Settings Install, Feedback, What's New and About sections author their spacing and words in
// Svelte; the native sections keep each as a local literal for the StyleX web compile, so both
// sides are read from source here.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const shipping = (path) => read(`web/src/lib/components/${path}`);
const native = (path) => read(`experiments/native-architecture/src/${path}`);

const SHIPPING = {
  setup: shipping('settings/SetupInstructions.svelte'),
  reportForm: shipping('settings/ReportForm.svelte'),
  reportFields: shipping('report/ReportFields.svelte'),
  about: shipping('settings/AboutSection.svelte'),
  whatsNew: shipping('settings/WhatsNewSection.svelte'),
  releaseHeading: shipping('ReleaseSectionHeading.svelte'),
  releaseSections: read('web/src/lib/releaseSections.ts'),
};
const NATIVE = {
  install: native('rsdDrawing/RsdInstallGuide.tsx'),
  // The form and the device opt-in it shares with the AI problem report.
  feedback:
    native('rsdDrawing/RsdFeedbackSection.tsx') + native('rsdDrawing/RsdDeviceOptInContent.tsx'),
  picker: native('rsdDrawing/RsdSegmentedPicker.tsx'),
  about: native('rsdDrawing/RsdAboutSection.tsx'),
  whatsNew: native('rsdDrawing/RsdWhatsNewSection.tsx'),
  whatsNewOwner: native('settings/whatsNew.ts'),
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The value of one declaration inside the first rule whose selector is exactly `selector`.
function declaration(source, selector, property) {
  const block = new RegExp(`(?:^|\\n)\\s*${escape(selector)} \\{([^}]*)\\}`).exec(source)?.[1];
  if (block === undefined) return `no ${selector} rule`;
  return new RegExp(`(?:^|[;\\s])${escape(property)}: ([^;]+);`).exec(block)?.[1].trim();
}

// A module-scope literal constant of a native source, evaluated.
function constant(source, name) {
  const expression = new RegExp(
    `\\n(?:export )?const ${name} = ([\\s\\S]+?)(?: as const)?(?: satisfies [^;]+)?;\\n`
  ).exec(source)?.[1];
  if (expression === undefined) throw new Error(`No literal ${name}`);
  return Function(`return (${expression});`)();
}

const px = (value) => (value === 0 ? '0' : `${value}px`);
const box = (...values) => values.map(px).join(' ');
// What shipping's markup reads as: tags removed and whitespace collapsed.
const text = (svelte) =>
  svelte
    .slice(svelte.indexOf('</script>'), svelte.indexOf('<style>'))
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

function pairs() {
  const { install, feedback, picker, about, whatsNew } = NATIVE;
  const steps = constant(install, 'STEPS_PADDING_PX');
  const note = constant(install, 'NOTE_PADDING_PX');
  const summary = constant(feedback, 'DEVICE_SUMMARY_PADDING_PX');
  const list = constant(feedback, 'DEVICE_LIST_PADDING_PX');
  const deviceNote = constant(feedback, 'DEVICE_NOTE_PADDING_PX');
  const area = constant(feedback, 'TEXTAREA_PADDING_PX');
  return [
    // SetupInstructions.svelte
    [
      SHIPPING.setup,
      '.os-section :global(h3.os-heading)',
      'margin-bottom',
      px(constant(install, 'OS_HEADING_GAP_PX')),
    ],
    [
      SHIPPING.setup,
      '.os-section :global(.help-section)',
      'margin-bottom',
      px(constant(install, 'SECTION_GAP_PX')),
    ],
    [
      SHIPPING.setup,
      '.os-section :global(.help-section summary)',
      'padding',
      px(constant(install, 'SUMMARY_PADDING_PX')),
    ],
    [SHIPPING.setup, ':global(.step-icon)', 'width', px(constant(install, 'STEP_ICON_PX'))],
    [SHIPPING.setup, '.steps', 'padding', box(steps.block, steps.right, steps.block, steps.left)],
    [SHIPPING.setup, '.steps', 'line-height', String(constant(install, 'STEPS_LINE_HEIGHT'))],
    [SHIPPING.setup, '.steps li', 'margin-bottom', px(constant(install, 'STEP_GAP_PX'))],
    [SHIPPING.setup, '.steps-note', 'padding', box(note.block, note.inline)],
    [SHIPPING.setup, '.steps-note', 'line-height', String(constant(install, 'NOTE_LINE_HEIGHT'))],
    [
      SHIPPING.setup,
      '.steps-note + .steps,\n  .steps + .steps-note',
      'padding-top',
      px(constant(install, 'NOTE_JOIN_PADDING_PX')),
    ],
    [SHIPPING.setup, '.one-tap', 'margin-bottom', px(constant(install, 'ONE_TAP_GAP_PX'))],
    [
      SHIPPING.setup,
      '.one-tap-hint',
      'margin',
      box(constant(install, 'ONE_TAP_HINT_GAP_PX'), 0, 0),
    ],
    [SHIPPING.setup, ':global(.one-tap-icon)', 'width', px(constant(install, 'ONE_TAP_ICON_PX'))],
    [SHIPPING.setup, '.install-check', 'margin-left', px(constant(install, 'LOCKED_CHECK_GAP_PX'))],
    // ReportForm.svelte and ReportFields.svelte
    [
      SHIPPING.reportForm,
      '.setting-group :global(h3.report-heading)',
      'margin-bottom',
      px(constant(feedback, 'HEADING_BOTTOM_PX')),
    ],
    [
      SHIPPING.reportForm,
      '.report-intro',
      'margin',
      box(0, 0, constant(feedback, 'INTRO_BOTTOM_PX')),
    ],
    [
      SHIPPING.reportForm,
      '.report-intro',
      'line-height',
      String(constant(feedback, 'INTRO_LINE_HEIGHT')),
    ],
    [SHIPPING.reportForm, '.report-card', 'gap', px(constant(feedback, 'FIELD_GAP_PX'))],
    [SHIPPING.reportFields, '.report-fields', 'gap', px(constant(feedback, 'FIELD_GAP_PX'))],
    [SHIPPING.reportFields, '.report-device', 'gap', px(constant(feedback, 'DEVICE_GAP_PX'))],
    [SHIPPING.reportFields, '.report-check', 'gap', px(constant(feedback, 'CHECK_GAP_PX'))],
    [
      SHIPPING.reportFields,
      '.report-check',
      'line-height',
      String(constant(feedback, 'CHECK_LINE_HEIGHT')),
    ],
    [SHIPPING.reportFields, '.report-check input', 'width', px(constant(feedback, 'CHECKBOX_PX'))],
    [
      SHIPPING.reportFields,
      '.report-check input',
      'margin',
      box(constant(feedback, 'CHECKBOX_TOP_PX'), 0, 0),
    ],
    [
      SHIPPING.reportFields,
      '.report-privacy-note',
      'margin',
      box(-constant(feedback, 'PRIVACY_PULL_PX'), 0, 0),
    ],
    [
      SHIPPING.reportFields,
      '.report-privacy-note',
      'line-height',
      String(constant(feedback, 'PRIVACY_LINE_HEIGHT')),
    ],
    [
      SHIPPING.reportFields,
      '.report-device :global(.report-device-details summary)',
      'padding',
      box(summary.block, summary.inline),
    ],
    [SHIPPING.reportFields, '.report-device-list', 'padding', box(0, list.inline, list.bottom)],
    [
      SHIPPING.reportFields,
      '.report-device-list li',
      'line-height',
      String(constant(feedback, 'DEVICE_LIST_LINE_HEIGHT')),
    ],
    [
      SHIPPING.reportFields,
      '.report-device-empty',
      'padding',
      box(0, list.inline, constant(feedback, 'DEVICE_EMPTY_BOTTOM_PX')),
    ],
    [
      SHIPPING.reportFields,
      '.report-device-note',
      'padding',
      box(deviceNote.top, deviceNote.inline, deviceNote.bottom),
    ],
    [
      SHIPPING.reportFields,
      '.report-device-note',
      'line-height',
      String(constant(feedback, 'DEVICE_NOTE_LINE_HEIGHT')),
    ],
    [
      SHIPPING.reportFields,
      '.report-textarea',
      'min-height',
      px(constant(feedback, 'TEXTAREA_MIN_HEIGHT_PX')),
    ],
    [SHIPPING.reportFields, '.report-textarea', 'padding', box(area.block, area.inline)],
    [
      SHIPPING.reportFields,
      '.report-textarea',
      'line-height',
      String(constant(feedback, 'TEXTAREA_LINE_HEIGHT')),
    ],
    [
      SHIPPING.reportFields,
      '.report-fields :global(.report-kind)',
      'gap',
      px(constant(picker, 'TIGHT_TRACK_GAP_PX')),
    ],
    [
      SHIPPING.reportFields,
      '.report-fields :global(.report-kind)',
      'padding',
      px(constant(picker, 'TIGHT_TRACK_PADDING_PX')),
    ],
    [
      SHIPPING.reportFields,
      '.report-fields :global(.report-kind .option)',
      'padding',
      box(
        constant(picker, 'TIGHT_OPTION_PADDING_BLOCK_PX'),
        constant(picker, 'TIGHT_OPTION_PADDING_INLINE_PX')
      ),
    ],
    // AboutSection.svelte
    [SHIPPING.about, '.about-brand', 'gap', px(constant(about, 'BRAND_GAP_PX'))],
    [SHIPPING.about, '.about-brand', 'margin-bottom', px(constant(about, 'BRAND_BOTTOM_PX'))],
    [SHIPPING.about, ':global(.about-icon)', 'width', px(constant(about, 'MARK_PX'))],
    [SHIPPING.about, '.about-tagline', 'max-width', px(constant(about, 'TAGLINE_MAX_WIDTH_PX'))],
    [
      SHIPPING.about,
      '.about-tagline',
      'line-height',
      String(constant(about, 'TAGLINE_LINE_HEIGHT')),
    ],
    [SHIPPING.about, '.about-links', 'padding-top', px(constant(about, 'LINKS_TOP_PX'))],
    [SHIPPING.about, '.about-links p', 'margin', box(0, 0, constant(about, 'LINE_GAP_PX'))],
    [
      SHIPPING.about,
      '.about-links > p.github-link',
      'margin',
      box(constant(about, 'GITHUB_BLOCK_PX'), 0),
    ],
    [SHIPPING.about, '.github-link a', 'gap', px(constant(about, 'GITHUB_GAP_PX'))],
    [SHIPPING.about, ':global(.github-icon)', 'width', px(constant(about, 'GITHUB_ICON_PX'))],
    // WhatsNewSection.svelte and ReleaseSectionHeading.svelte
    [SHIPPING.whatsNew, '.whats-new', 'margin-bottom', px(constant(whatsNew, 'CARD_BOTTOM_PX'))],
    [SHIPPING.whatsNew, '.whats-new', 'padding', px(constant(whatsNew, 'CARD_PADDING_PX'))],
    [
      SHIPPING.whatsNew,
      '.whats-new-heading',
      'margin',
      box(0, 0, constant(whatsNew, 'DATE_BOTTOM_PX')),
    ],
    [
      SHIPPING.whatsNew,
      '.whats-new-body :global(:is(h3, h4, h5, h6))',
      'margin',
      box(constant(whatsNew, 'HEADING_TOP_PX'), 0, constant(whatsNew, 'HEADING_BOTTOM_PX')),
    ],
    [
      SHIPPING.whatsNew,
      '.whats-new-body :global(ul)',
      'padding-left',
      px(constant(whatsNew, 'LIST_INDENT_PX')),
    ],
    [
      SHIPPING.whatsNew,
      '.whats-new-body :global(li)',
      'margin-bottom',
      px(constant(whatsNew, 'ITEM_GAP_PX')),
    ],
    [
      SHIPPING.whatsNew,
      '.whats-new-body :global(li)',
      'line-height',
      String(constant(whatsNew, 'ITEM_LINE_HEIGHT')),
    ],
    [
      SHIPPING.whatsNew,
      '.all-releases',
      'margin',
      box(constant(whatsNew, 'ALL_RELEASES_TOP_PX'), 0, 0),
    ],
    [
      SHIPPING.whatsNew,
      '.all-releases :global(.all-releases-icon)',
      'width',
      px(constant(whatsNew, 'CHEVRON_PX')),
    ],
    [
      SHIPPING.whatsNew,
      '.all-releases :global(.all-releases-icon)',
      'margin-right',
      px(-constant(whatsNew, 'CHEVRON_PULL_PX')),
    ],
    [
      SHIPPING.releaseHeading,
      '.release-section-heading :global(.release-section-icon)',
      'width',
      'var(--space-6)',
    ],
  ];
}

describe('native Settings info sections against their shipping sources', () => {
  it('keep every shipping spacing, size and line height', () => {
    for (const [source, selector, property, expected] of pairs())
      expect(declaration(source, selector, property), `${selector} ${property}`).toBe(expected);
    expect(constant(NATIVE.whatsNew, 'RELEASE_ICON_PX')).toBe(24);
  });

  it('detects a negative control: a changed native literal no longer matches', () => {
    const changed = NATIVE.about.replace('const MARK_PX = 96;', 'const MARK_PX = 80;');
    expect(px(constant(changed, 'MARK_PX'))).not.toBe(
      declaration(SHIPPING.about, ':global(.about-icon)', 'width')
    );
  });

  it('keep the Feedback form copy', () => {
    const form = text(SHIPPING.reportForm);
    const fields = text(SHIPPING.reportFields);
    for (const copy of [REPORT_FORM_COPY.heading, REPORT_FORM_COPY.intro])
      expect(form).toContain(copy);
    for (const copy of [
      `${REPORT_FORM_COPY.includeDevice} ${REPORT_FORM_COPY.includeDeviceWhy}`,
      REPORT_FORM_COPY.deviceSummary,
      REPORT_FORM_COPY.deviceGathering,
      REPORT_FORM_COPY.deviceNote,
      REPORT_FORM_COPY.privacy,
    ])
      expect(fields).toContain(copy);
    expect(SHIPPING.reportFields).toContain(`label="${REPORT_FORM_COPY.kindLabel}"`);
    expect(SHIPPING.reportForm).toContain(
      `{submitting ? '${REPORT_FORM_COPY.sending}' : '${REPORT_FORM_COPY.send}'}`
    );
    expect(SHIPPING.reportForm).toContain(`feedback = '${REPORT_FORM_COPY.sent}';`);
    expect(SHIPPING.reportFields).toContain(`rows="${constant(NATIVE.feedback, 'TEXTAREA_ROWS')}"`);
    expect(SHIPPING.reportFields).toContain(
      `@media (max-width: ${px(constant(NATIVE.feedback, 'TIGHT_PICKER_MAX_WIDTH_PX'))})`
    );
    for (const [kind, prompt] of Object.entries(MESSAGE_PROMPT_BY_KIND)) {
      const block = new RegExp(`${kind}: \\{([^}]*)\\}`).exec(SHIPPING.reportFields)?.[1] ?? '';
      expect(block, kind).toContain(JSON.stringify(prompt.label).slice(1, -1));
      expect(block, kind).toContain(prompt.placeholder);
    }
  });

  it("keep the About and What's New words, icons and link targets", () => {
    const about = text(SHIPPING.about);
    for (const copy of [
      constant(NATIVE.about, 'ABOUT_COPY').tagline,
      'Privacy Policy',
      'View on GitHub',
    ])
      expect(about).toContain(copy);
    expect(SHIPPING.about).toContain('aria-label="Splotch"');
    expect(SHIPPING.about).toContain('Version {APP_VERSION}');
    expect(text(SHIPPING.whatsNew)).toContain(WHATS_NEW_COPY.allReleases);
    expect(SHIPPING.about).toContain('<a href="/privacy">');
    expect(SHIPPING.whatsNew).toContain('<a href="/changelog">');
    expect(HOSTED_PAGES).toEqual({
      github: GITHUB_REPO_URL,
      openAiKeys: 'https://platform.openai.com/api-keys',
    });
    const shippingIcons = /RELEASE_SECTION_ICONS = (\{[^}]*\})/.exec(SHIPPING.releaseSections)?.[1];
    expect(constant(NATIVE.whatsNewOwner, 'RELEASE_SECTION_ICONS')).toEqual(
      Function(`return (${shippingIcons});`)()
    );
  });
});

it('keeps the standalone Feedback hero and next steps from the shipping route', () => {
  const source = text(read('web/src/routes/feedback/+page.svelte'));
  for (const copy of [
    FEEDBACK_PAGE_COPY.lede,
    FEEDBACK_PAGE_COPY.next,
    ...FEEDBACK_PAGE_COPY.steps,
    FEEDBACK_PAGE_COPY.privacy,
    FEEDBACK_PAGE_COPY.sentLede,
    FEEDBACK_PAGE_COPY.sentStatus,
    FEEDBACK_PAGE_COPY.sendAnother,
  ])
    expect(source).toContain(copy);
  expect(read('web/src/routes/feedback/+page.svelte')).toContain(FEEDBACK_PAGE_COPY.title);
  expect(read('web/src/routes/feedback/+page.svelte')).toContain(FEEDBACK_PAGE_COPY.sentTitle);
  expect(read('web/src/routes/feedback/+page.svelte')).toContain(
    `feature: '${REPORT_FORM_COPY.sendIdea}'`
  );
});
