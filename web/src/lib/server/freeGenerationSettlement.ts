import type { FreeGenerationFailureKind } from '$lib/freeGenerations';
import { completeFreeGeneration, failFreeGeneration } from './freeGenerationGrants';
import type { GenerationAuthorization } from './generationAuthorization';
import type { GenerationRouteTag } from './generationDelivery';
import { loggableError } from './logRedaction';

// Booking a generation's outcome against the free grant (ADR-0105), shared by the
// in-line route and the background poll (ADR-0115). Neither lets a ledger write
// that fails reach the child: the outcome is already decided, a reservation left
// unsettled lapses on its own, and the daily provider-start ceiling still bounds
// spending. The failure is warned and the remaining-count header omitted.

/**
 * The installation a free generation charges, and the reservation it still owns.
 * No reservation means none was taken yet, or it already passed out of this
 * request's hands: spent, released, or handed to a background job.
 */
export interface FreeCharge {
  readonly installationId: string;
  readonly reservationId?: string;
}

/** The charge a free authorization opens, before anything is reserved. */
export function freeChargeFor(authorization: GenerationAuthorization): FreeCharge | null {
  return authorization.kind === 'free' ? { installationId: authorization.installationId } : null;
}

/** The same charge once its reservation is no longer this request's to settle. */
export function unreserved(charge: FreeCharge | null): FreeCharge | null {
  return charge && { installationId: charge.installationId };
}

function warnUnsettled(logTag: GenerationRouteTag, cause: unknown): void {
  console.warn(`[${logTag}] failed to record the settled generation:`, loggableError(cause));
}

/**
 * Spend the reserved slot now that a picture exists, and answer with what is
 * left, or null when nothing was reserved or the ledger could not be written.
 */
export async function completeFreeCharge(
  charge: FreeCharge | null,
  logTag: GenerationRouteTag
): Promise<number | null> {
  if (!charge?.reservationId) return null;
  try {
    return (await completeFreeGeneration(charge.installationId, charge.reservationId)).remaining;
  } catch (cause) {
    warnUnsettled(logTag, cause);
    return null;
  }
}

/**
 * Book a generation that produced no picture: release the reservation the charge
 * still owns, or, with none, count an unreserved failed attempt.
 */
export async function failFreeCharge(
  charge: FreeCharge | null,
  kind: FreeGenerationFailureKind,
  logTag: GenerationRouteTag
): Promise<void> {
  if (!charge) return;
  try {
    await failFreeGeneration(charge.installationId, kind, charge.reservationId);
  } catch (cause) {
    warnUnsettled(logTag, cause);
  }
}
