import { redirect } from '@sveltejs/kit';
import { betaPathFor } from '$lib/components/beta/betaPlatform';

// Deprecated: the Android and iOS instructions were consolidated into /beta's
// two tabs (ADR-0112). This path stays alive because it was handed to testers on
// its own, so it redirects rather than 404s — carrying `?os=android` so an old
// link still opens the instructions it promised, whatever device follows it.
//
// NOT prerendered, unlike every other page here: prerendering a redirect writes
// a meta-refresh document, and the prerenderer also follows the `Location` —
// emitting a second full copy of /beta under the literal filename
// `beta?os=android.html`, unreachable junk in the publish directory. A redirect
// belongs in the response status anyway, so this stays a real 308.
//
// The deployed site never reaches this load: netlify.toml redirects both
// deprecated paths at the edge, before the SSR function is invoked (the drift
// guard is betaPlatform.test.ts). This is what answers everywhere else — dev,
// `vite preview`, and the E2E suite — so the behavior is exercised rather than
// assumed.
export const prerender = false;

export function load(): never {
  redirect(308, betaPathFor('android'));
}
