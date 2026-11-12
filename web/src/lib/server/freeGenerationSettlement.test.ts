// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { completeFreeGeneration, failFreeGeneration } = vi.hoisted(() => ({
  completeFreeGeneration: vi.fn(),
  failFreeGeneration: vi.fn(),
}));

vi.mock('./freeGenerationGrants', () => ({ completeFreeGeneration, failFreeGeneration }));

import {
  completeFreeCharge,
  failFreeCharge,
  freeChargeFor,
  unreserved,
} from './freeGenerationSettlement';

const installationId = 'a'.repeat(64);
const reserved = { installationId, reservationId: 'reservation-1' };
const unreservedCharge = { installationId };

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  completeFreeGeneration.mockReset();
  failFreeGeneration.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('freeChargeFor', () => {
  it('opens an unreserved charge for a free authorization only', () => {
    expect(
      freeChargeFor({ authorized: true, kind: 'free', effectiveKey: 'k', installationId })
    ).toEqual(unreservedCharge);
    expect(freeChargeFor({ authorized: true, kind: 'byok', effectiveKey: 'k' })).toBeNull();
    expect(
      freeChargeFor({ authorized: true, kind: 'managed', effectiveKey: 'k', managedToken: 't' })
    ).toBeNull();
  });
});

describe('unreserved', () => {
  it('keeps the installation and drops the reservation', () => {
    expect(unreserved(reserved)).toEqual(unreservedCharge);
    expect(unreserved(null)).toBeNull();
  });
});

describe('completeFreeCharge', () => {
  it('spends the reservation and answers what is left', async () => {
    completeFreeGeneration.mockResolvedValue({ remaining: 7 });

    await expect(completeFreeCharge(reserved, 'generate-image')).resolves.toBe(7);
    expect(completeFreeGeneration).toHaveBeenCalledExactlyOnceWith(installationId, 'reservation-1');
  });

  it.each([
    ['no charge', null],
    ['a charge with no reservation', unreservedCharge],
  ])('books nothing for %s', async (_label, charge) => {
    await expect(completeFreeCharge(charge, 'generate-image')).resolves.toBeNull();
    expect(completeFreeGeneration).not.toHaveBeenCalled();
  });

  it('warns, tagged with the route, and answers null when the ledger write fails', async () => {
    completeFreeGeneration.mockRejectedValue(new Error('Free generation grant is busy'));

    await expect(completeFreeCharge(reserved, 'generation-result')).resolves.toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[generation-result] failed to record the settled generation:',
      'Free generation grant is busy'
    );
  });
});

describe('failFreeCharge', () => {
  it('releases the reservation the charge still owns', async () => {
    await failFreeCharge(reserved, 'safety', 'generate-image');

    expect(failFreeGeneration).toHaveBeenCalledExactlyOnceWith(
      installationId,
      'safety',
      'reservation-1'
    );
  });

  it('counts an unreserved failed attempt when the charge owns no reservation', async () => {
    await failFreeCharge(unreservedCharge, 'invalid-request', 'generate-image');

    expect(failFreeGeneration).toHaveBeenCalledExactlyOnceWith(
      installationId,
      'invalid-request',
      undefined
    );
  });

  it('books nothing without a charge', async () => {
    await failFreeCharge(null, 'upstream', 'generate-image');

    expect(failFreeGeneration).not.toHaveBeenCalled();
  });

  it('warns, tagged with the route, instead of throwing when the ledger write fails', async () => {
    failFreeGeneration.mockRejectedValue(new Error('Free generation grant is busy'));

    await expect(failFreeCharge(reserved, 'upstream', 'generate-image')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[generate-image] failed to record the settled generation:',
      'Free generation grant is busy'
    );
  });
});
