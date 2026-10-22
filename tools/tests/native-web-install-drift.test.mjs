import { expect, it } from 'vitest';

import { installGuideStepParts } from '../../experiments/native-architecture/src/install/installGuideCopy.ts';

const SHARE_LOCATION = '{shareLocation}';

it('keeps the Settings install guide', () => {
  expect(installGuideStepParts('ios', SHARE_LOCATION, true)).toHaveLength(
    installGuideStepParts('ios', SHARE_LOCATION, false).length + 1
  );
});
