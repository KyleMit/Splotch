import { createLazyExport } from '../lazyExport';
import { afterDrawingPaint } from './afterDrawingPaint.web';
import { launchInvite } from '../platform/launchInvites.web';
import type { createProductOwners } from './productOwners';

type ProductChunk = Readonly<{ createProductOwners: typeof createProductOwners }>;

// Parameterized so tests can fail the chunk request; production passes the arguments below.
export function createProductOwnersLoader(
  importChunk: () => Promise<ProductChunk>,
  invite: { settle(): Promise<void> },
  ready: () => Promise<void>
) {
  return createLazyExport(async () => {
    await ready();
    const { createProductOwners } = await importChunk();
    // A launch invite whose vault chunk failed to load is saved now, before the AI owner exists
    // to read a credential.
    await invite.settle();
    return createProductOwners;
  });
}

// AI generation and recovery with its storage and vault, and feedback, are about 140 KB the
// drawing screen does not need to paint, so the web export loads them in their own chunk
// (productChunk.web.ts) once the screen has painted (ADR-0179).
export const productOwners = createProductOwnersLoader(
  () => import('./productChunk.web'),
  launchInvite,
  afterDrawingPaint
);
