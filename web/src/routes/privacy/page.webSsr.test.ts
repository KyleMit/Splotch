// @vitest-environment node
import { vi } from 'vitest';
import { describePolicyRevisions } from './policyRevisionsTestHarness';

vi.mock('$app/state', () => ({ page: { url: new URL('https://splotch.art/privacy') } }));

// vitest.webSsr.config.ts compiles `__IS_CAPACITOR__` as false, so this is the
// policy the web build serves at /privacy.
describePolicyRevisions('web');
