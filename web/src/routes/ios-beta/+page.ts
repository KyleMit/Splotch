import { redirect } from '@sveltejs/kit';
import { betaPathFor } from '$lib/components/beta/betaPlatform';

// Deprecated: see the sibling /android-beta redirect for why this is a real 308
// rather than a prerendered document. This path was the public TestFlight
// hand-out, so it keeps working and lands on /beta's iOS tab.
export const prerender = false;

export function load(): never {
  redirect(308, betaPathFor('ios'));
}
