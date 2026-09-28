// @vitest-environment node
import { describePolicyRevisions } from './policyRevisionsTestHarness';

// vitest.webSsr.config.ts compiles `__IS_CAPACITOR__` as false, so this is the
// policy the web build serves at /privacy.
describePolicyRevisions('web');
