# ADR-0112: One `/beta` Page with Platform Tabs, Chosen Before First Paint

**Status:** Active **Date:** 2026-08

## Context

Beta enrollment shipped as two standalone pages, `/android-beta` (Google Play closed testing) and
`/ios-beta` (TestFlight). They shared a shell, a step ledger, and three of their four steps, and
differed only in the store they walk a parent through. Handing the link out meant knowing which
device the reader holds — and a parent forwarding "try the beta" to another parent frequently does
not. The wrong link is a dead end: TestFlight instructions on an Android phone have no next step.

Both are also web-only in two layers already (`prerender = !__IS_CAPACITOR__` plus the source
exclusion in `web/nativeExcludedRoutes.ts`), because Play Store URLs inside an iOS binary are an App
Review 2.3.10 rejection and an enrollment page inside the app it enrolls into is circular.

The page is prerendered, so its HTML is written at build time and cannot know either the visitor's
device or the link's query string. That is the whole design problem: anything resolved at hydration
paints one state first and rearranges itself a few hundred milliseconds later, on exactly the phones
this page is read on.

## Decision

**One route, `/beta`, with an Android tab and an iOS tab.** Each platform's steps and
troubleshooting move into `AndroidBetaPanel` / `IosBetaPanel`; both panels are in every response.
The picker is the `SegmentedPicker` primitive rather than a bespoke tablist — in the `underline`
variant the amendment below adds, which is also where the tab labels and the row's responsive width
are settled.

**The tab is chosen before first paint by an inline `<head>` script.** It resolves `?os=` first (an
explicit link wins — it names the instructions its reader was promised), then the device, then falls
back to Android, and stamps the result on `<html>` as `data-beta-os`. The page's CSS filters the
panels off that attribute, so the correct panel is the one that paints; hydration only catches the
picker up. The script is built from the same constants the page reads (`betaPlatform.ts`), so the
query key, the platform names, and the fallback cannot drift; the device sniff is the one
duplication of `$lib/platform`, and `betaPlatform.test.ts` reads both sides and fails on divergence
— the same shape as `app.html`'s pre-hydration stamp and `app.html.test.ts`.

**With no stamp, both panels stay visible.** No JavaScript means no attribute, no matching rule, and
two labelled sections stacked — the picker stands down through a `<noscript>` rule. A tester with
scripting off still gets the instructions for their device instead of the other platform's.

**The old paths are deprecated, not deleted.** `/android-beta` and `/ios-beta` 308 to
`/beta?os=android` / `/beta?os=ios`. They were handed out on their own, so they keep working.

## Consequences

* One page to keep current, one design review, one accessibility scan, and a link that is correct
  for whoever opens it — the reason to consolidate at all.
* The redirect routes are **not** prerendered, unlike everything else here. Prerendering a redirect
  writes a meta-refresh document *and* makes the prerenderer follow the `Location`, emitting a
  second full copy of `/beta` under the literal filename `beta?os=android.html` — unreachable junk
  in the publish directory. A redirect belongs in the response status anyway.
* Because they are SSR, the deployed site would invoke the serverless function to answer a retired
  URL. `netlify.toml` redirects both at the edge instead (the pattern the deny rules already use),
  and the route-level redirect is what answers in dev, `vite preview`, and the E2E suite — so the
  behavior is exercised rather than assumed. `betaPlatform.test.ts` fails if the two targets
  disagree, or if a future `*-beta` route is retired without an edge rule.
* Selecting a tab rewrites the URL with `replaceState`, so a copied address opens the same
  instructions and Back leaves the page rather than walking the tabs.
* Both panels ship in every response, roughly doubling the page's HTML. It is a text page with no
  images; the alternative — fetching the other panel on demand — would cost a round trip on a phone
  to save bytes that compress well and buy back the no-JavaScript fallback for nothing.
* `web/tests/beta.spec.ts` replaces the two per-platform specs, and adds what consolidation makes
  possible to get wrong: the deep link, the device default (driven under an iPad and an Android user
  agent), both redirects, the scripting-off fallback, and — by blocking the client bundle outright —
  that the detected platform is what paints with no hydration at all.

## Amendment (2026-08): the tabs are an `underline` variant, not the segmented track

The picker shipped as the existing `segment` skin — the track from Settings. Reviewing it against
five other treatments (contact sheets in the PR) settled two things the original decision left open.

**A tab header is not a setting, and the skin should say so.** The segmented track means "one of
these is on" wherever else it appears in the app. Over a document it reads as a control dropped onto
a page. `SegmentedPicker` grows a third variant, `underline`: one hairline under a row of labels,
the live tab replacing its stretch of that rule with a brand segment and taking the brand ink with
it, its icon following that ink rather than `--icon-ink` so the mark moves as one. It stays a
radiogroup — same roving tabindex, same arrow keys, same native-radio mode with JavaScript off — so
this is paint, not structure.

Each tab carries a mark, and which mark is a compliance question rather than a taste one. Google
permits the Android robot in a single solid color, so the Android tab wears it. Apple's App Store
marketing guidance rules out the standalone Apple logo without written permission — on a public page
promoting the beta, that is a risk with no upside — so the other tab wears a generic
phone-and-tablet glyph and the label does the identifying: `iPhone / iPad`, the product names
Apple's messaging guidance asks for rather than the OS name. The slash is what keeps it to one line
in half a 375px screen; `beta.spec.ts` measures that rather than assuming it.

**The row's width is the variant's business, not the caller's.** `underline` hugs the left on a
sheet and, at phone width, splits the row evenly so each live segment is a whole cell — the shape
that reads as a two-position switch. It ignores `fill` deliberately: a caller that could set the
wrong value on a phone is a caller that will. The 44px interaction floor is the variant's too, and
it belongs in the base rule rather than the phone query: a touch-capable tablet sits above the phone
step and still gets fingers, and the row's padding alone lands it at 43px. `/beta` supplies only
what the primitive cannot know — the bleed past `--page-gutter`, so the rule reaches the glass on a
wall-to-wall sheet.

That bleed is why the breakpoint is now shared rather than repeated: a row that bleeds while the
sheet still has a frame hangs its rule over the ground. `PHONE_MAX_WIDTH_PX` (`lib/breakpoints.ts`)
names the step, `phoneStep.test.ts` holds every file that restates it — `PageShell`, `BrandMark`,
the two beta ledger components, the picker, and the page — to that one value, and fails on a second
step declared anywhere near it.
