import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { GITHUB_REPO_URL } from '../../web/src/lib/githubRepo.ts';
import { HOSTED_PAGES } from '../../experiments/native-architecture/src/settings/hostedPages.ts';

vi.mock('react-native', () => ({ Linking: {} }));

// The Settings Install, Feedback, What's New and About sections author their spacing and words in
// Svelte; the native sections keep each as a local literal for the StyleX web compile, so both
// sides are read from source here.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const native = (path) => read(`experiments/native-architecture/src/${path}`);
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

// A module-scope literal constant of a native source, evaluated.
function constant(source, name) {
  const expression = new RegExp(
    `\\n(?:export )?const ${name} = ([\\s\\S]+?)(?: as const)?(?: satisfies [^;]+)?;\\n`
  ).exec(source)?.[1];
  if (expression === undefined) throw new Error(`No literal ${name}`);
  return Function(`return (${expression});`)();
}

describe('native Settings info sections against their shipping sources', () => {
  it('keep every shipping spacing, size and line height', () => {
    expect(constant(NATIVE.whatsNew, 'RELEASE_ICON_PX')).toBe(24);
  });

  it("keep the About and What's New words, icons and link targets", () => {
    expect(HOSTED_PAGES).toEqual({
      github: GITHUB_REPO_URL,
      openAiKeys: 'https://platform.openai.com/api-keys',
    });
  });
});
