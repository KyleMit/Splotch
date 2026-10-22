import { describe, expect, it } from 'vitest';
import {
  exitGuideStepParts,
  installGuideStepParts,
  lockGuideStepParts,
} from '../../src/install/installGuideCopy.ts';
import { spokenInstallText } from '../../src/install/installCopy.ts';
import referenceSteps from './native-install-steps.fixture.json';
const collapse = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/ ([.,)])/g, '$1')
    .trim();
function nativeSteps(steps) {
  return steps.map((parts) => ({
    text: collapse(spokenInstallText(parts)),
    bold: parts
      .filter((part) => part.kind === 'strong' || part.kind === 'term')
      .map((part) => collapse(part.text)),
  }));
}
describe('native installation checklists', () => {
  it.each(referenceSteps.install)(
    'lists the $os install steps (outside Safari: $outsideSafari)',
    ({ os, outsideSafari, steps }) => {
      expect(nativeSteps(installGuideStepParts(os, '{shareLocation}', outsideSafari))).toEqual(
        steps
      );
    }
  );
  it.each(referenceSteps.lock)('lists the $os lock steps', ({ os, steps }) => {
    expect(nativeSteps(lockGuideStepParts(os))).toEqual(steps);
  });
  it.each(referenceSteps.exit)('lists the $os steps out of an engaged lock', ({ os, steps }) => {
    expect(nativeSteps(exitGuideStepParts(os))).toEqual(steps);
  });
});
