# App Store Compliance Ledger

A ledger of every store guideline that has shaped this codebase: the guideline text verbatim, how it
touches Splotch, and the decision that answers it — with the ADRs, issues, and commits where each
landed. The per-store submission checklists stay in [`android.md`](android.md) and
[`ios.md`](ios.md); this file is the *why* behind them, so a future change can be checked against
the actual policy text instead of a memory of it.

Quotes were captured 2026-08 from the
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and the
[Google Play Developer Policy Center](https://play.google.com/about/developer-content-policy/). Both
stores revise policy on their own schedule — re-verify a quote before relying on it for a new
decision, and update this ledger in the same change when a policy or a mitigation moves.

## Combined guideline table

Every specifically implemented guideline, and whether each store requires it. "Required" cites the
store's own rule; "Defensive" means Splotch implements it although that store does not demand it for
this app's shape.

| What Splotch implements                                                       | iOS (App Store)                       | Android (Google Play)                     | Decided in                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| Parental gate on every external link                                          | Required — 1.3 Kids Category          | Not required (shipped anyway)             | ADR-0094; issue 844                                                               |
| Parental gate on data-out actions (AI generate, image report, feedback)       | Required — 1.3, 5.1.4                 | Required — Families "adult action"        | ADR-0094, ADR-0104                                                                |
| No third-party ads or analytics SDKs at all                                   | Required — 1.3                        | Required — Families self-certified SDKs   | Never shipped; `/privacy` commits to it                                           |
| Privacy policy in listing metadata and reachable in-app                       | Required — 5.1.1, 5.1.4(b)            | Required — Families                       | `/privacy` route, bundled into both native builds and link-checked by `build:cap` |
| COPPA / GDPR-K posture (no accounts, no child name/email/location)            | Required — 5.1.4(a)                   | Required — Families                       | Whole-app design; `/privacy` "Children's privacy"                                 |
| No device identifiers to third parties (no AAID, IDFA, fingerprinting)        | Required — 1.3                        | Required — Families identifier list       | ADR-0105 pseudonym design                                                         |
| In-app reporting of AI-generated content                                      | Defensive — 1.2 targets shared UGC    | Required — AI-Generated Content policy    | ADR-0104; issue 848                                                               |
| No IAP, no purchase steering; BYOK worded as configuration                    | Required — 3.1.1 (non-US storefronts) | Required — Payments policy                | Issue 849; commit c2ee6446 (see Provenance)                                       |
| No hidden or privileged surfaces (admin console web-only, unlinked)           | Required — 2.3.1                      | Required — Deceptive Behavior             | ADR-0101                                                                          |
| No other-platform references inside the iOS binary                            | Required — 2.3.10                     | N/A                                       | ADR-0112; `web/nativeExcludedRoutes.ts` + bundle guard                            |
| iOS privacy manifest (`PrivacyInfo.xcprivacy`)                                | Required — ITMS-91053 upload gate     | N/A                                       | `ios/App/App/PrivacyInfo.xcprivacy`                                               |
| Data-disclosure agreement across manifest, labels, forms, and `/privacy`      | Required — nutrition label            | Required — Data safety form               | Consistency chain (below); issue 846                                              |
| AI provider whose terms permit child-directed use                             | Required — 5.1.4 (COPPA conduct)      | Required — Families APIs/SDKs + User Data | ADR-0113, ADR-0114; issue 845                                                     |
| Reviewer access to the gated AI feature (working access code + steps)         | Required — 2.1                        | Required — Play Console "App access"      | Issue 851 submission checklist                                                    |
| App complete and useful without any credential (free allowance, core drawing) | Required — 2.1, 4.2                   | Required — Broken-functionality policies  | ADR-0105; issue 599                                                               |
| Kids metadata, age declarations, content rating from real answers             | Required — 2.3.8, Kids Category       | Required — Target audience + IARC         | `store-assets/STORE-LISTING-*.md`                                                 |
| Permission hygiene; no location for a child-directed app                      | Required — 5.1.1 purpose strings      | Required — Families location rule         | Minimal manifests; `android.md` checklist                                         |
| No trademarked third-party content in bundles or metadata                     | Required — 5.2.1                      | Required — Intellectual Property policy   | Issue 851 (coloring-book list removal)                                            |

## Apple — App Review Guidelines

### 1.3 Kids Category

> "These apps must not include links out of the app, purchasing opportunities, or other distractions
> to kids unless reserved for a designated area behind a parental gate. […] Kids Category apps may
> not send personally identifiable information or device information to third parties. Apps in the
> Kids Category should not include third-party analytics or third-party advertising."

**Impact.** Splotch declares Kids Category, 5 & Under. Every outbound link (OpenAI key page, OpenAI
terms, GitHub, hosted feedback form, `/privacy` links) and the BYOK area are inside this rule's
blast radius; so is any analytics or ads SDK, of which the app ships none.

**Decisions.** ADR-0094 established operation-boundary gates — never a gate on Settings as a whole —
with per-feature `always`/`session`/`never` policies. Store builds arm every gate to `always` at
build time (`CAPACITOR=true` is the signal); the web build ships them off (commit
d0fc837e9db15db3379ed1785cce685211f54fdb). Native iOS keeps `never` visible but unavailable for
external links precisely because of this guideline (`isParentalGateModeAvailable`,
`web/src/lib/state/parentalGate.svelte.ts`). Links gate through the `parentalGateLink` action
(native privacy links landed in 4bc0073426317c83d7805fffb8d0e551dda114cd). Issue 844 (open) finishes
the job: putting the AI, feedback, and about *areas* — not just their links — behind the gate, which
makes the BYOK panel the "designated area" this guideline names.

### 1.2 Safety — User-Generated Content

> "Apps with user-generated content or social networking services must include: a method for
> filtering objectionable material from being posted to the app; a mechanism to report offensive
> content and timely responses to concerns; the ability to block abusive users from the service;
> published contact information so users can easily reach you."

**Impact.** Splotch has no user-to-user content: no sharing, chat, comments, or publishing, so 1.2
does not strictly bind. The AI report flow satisfies its spirit anyway, and answers the age-rating
questionnaire's UGC questions with a clean "No".

**Decisions.** "Report this picture" / "Report this refusal" (ADR-0104, issues 848 and the refusal
extension in f82616a03f310f98e4a60d8381e50972666a75e5); the server-built closed-enum prompt acts as
the filtering method; the feedback form is the published contact channel. Issue 212 ("Share a
Masterpiece") would re-open true 1.2 obligations and is deliberately sequenced after launch.

### 2.1 App Completeness

> "Include demo account info (and turn on your back-end service!) if your app includes a login. If
> you are unable to provide a demo account due to legal or security obligations, you may include a
> built-in demo mode in lieu of a demo account with prior approval by Apple."

**Impact.** The AI feature is unreachable without a credential, so review needs a way in — and the
free allowance means the reviewer's first taps work with no setup at all.

**Decisions.** Ten server-authoritative free generations per installation (ADR-0105); a working,
non-expiring access code goes in App Review notes at submission (issue 851's checklist), along with
the note that prompts are server-built from a closed style enum.

### 2.3.1 Accurate Metadata — hidden features

> "Don't include any hidden, dormant, or undocumented features in your app; your app's functionality
> should be clear to end users and App Review."

**Impact.** The former five-tap-on-version-string reveal of the `/admin` token console was exactly
this shape, inside a children's app.

**Decisions.** ADR-0101: the admin console is web-only and unlinked — the gesture, the persisted
reveal flag, and the prerendered `/admin/native` page are gone; `/admin` is in
`NATIVE_EXCLUDED_ROUTES`, and `tools/mobile/check-static-bundle.mjs` fails `build:cap` if console
copy (sentinels derived from `AdminConsole.svelte` placeholders, so the guard can't pass vacuously)
survives into built output.

### 2.3.8 Metadata age-appropriateness

> "Use of terms like 'For Kids' and 'For Children' in app metadata is reserved in the App Store for
> the Kids Category."

**Impact / decisions.** Splotch *is* Kids Category, so the naming is permitted; metadata and
screenshots keep to a 4+ rating. `store-assets/STORE-LISTING-IOS.md` pre-records the age-rating
questionnaire answers and pins "confirm ASC calculates 4+ before opting into Kids Category".

### 2.3.10 Platform focus

> "Don't include names, icons, or imagery of other mobile platforms or alternative app marketplaces
> in your app or metadata, unless there is specific, approved interactive functionality."

**Impact.** The `/beta` page carries Google Play opt-in URLs; a route's `prerender` flag drops only
its HTML while the JS chunk still ships, so those strings were landing inside the `.ipa` where a
reviewer's string scan finds them.

**Decisions.** `web/nativeExcludedRoutes.ts` stubs the route modules at build time
(`NATIVE_EXCLUDED_ROUTES`: `beta`, `android-beta`, `ios-beta`, `admin`, `feedback`), and
`tools/mobile/check-static-bundle.mjs` scans built output for `FORBIDDEN_NATIVE_HOSTS` by host — the
unit the guideline is about. ADR-0112 records the tabbed `/beta` consolidation
(ed186a02dbdb69b0804ffc6f8882c89791abfa1d).

### 3.1.1 In-App Purchase

> "If you want to unlock features or functionality within your app […] you must use in-app purchase.
> Apps may not use their own mechanisms to unlock content or functionality, such as license keys
> […]. Except for apps on the United States storefront, apps and their metadata may not include
> buttons, external links, or other calls to action that direct customers to purchasing mechanisms
> other than in-app purchase."

**Impact.** Splotch sells nothing and takes no cut; the exposure was the BYOK how-to, whose "add a
little credit under Billing" step and per-picture price note read as an in-app call to action to
spend money outside IAP — prohibited on non-US storefronts even after the 2025 US changes. The key
itself is configuration of the parent's own third-party account, the shape with strong BYOK
precedent, not the "license key unlocks content" shape this rule targets: the feature works with no
key via the free allowance, and access codes are given away, never sold.

**Decisions.** Issue 849: keep BYOK, worded as configuration — the purchase language and pricing
were removed in commit c2ee6446e3a294cd4a55cfc148f37f1f01c8dc04, leaving a factual statement of
OpenAI's account requirements. The OpenAI link stays (it is key management, not a checkout) and
remains behind the external-links gate. If a rejection still comes: move the whole how-to behind the
gate solve (iOS), or drop the external link from the Android build (Play).

### 4.2 Minimum Functionality

> "If your App doesn't provide some sort of lasting entertainment value or adequate utility, it may
> not be accepted."

**Impact / decisions.** Reviewers sometimes read "user must supply an API key" as an incomplete app.
Splotch is a complete offline drawing app with AI as an additive feature, and the free allowance
(ADR-0105) means even the AI path works out of the box. Issue 599 (a saved key never unhid the magic
button) was fixed to keep that story true.

### 5.1.1 Data Collection and Storage

> "All apps must include a link to their privacy policy in the App Store Connect metadata field and
> within the app in an easily accessible manner. […] Apps that collect user or usage data must
> secure user consent for the collection, even if such data is considered to be anonymous."

**Impact / decisions.** `/privacy` is live at splotch.art/privacy, bundled into both native builds,
and linked from the listing. "Easily accessible" is the half a bundled file does not satisfy on its
own, so `build:cap` enforces both: `requiredNativePageProblems` in
`tools/mobile/check-static-bundle.mjs` fails the build if `privacy.html` is missing from the static
export, and `requiredNativePageLinkProblems` fails it if nothing in the shipped bundle links to
`/privacy` — the in-app path is Settings → About → Privacy Policy. ADR-0120 records why that is a
build-time assertion rather than a step in the native smoke. Consent is structured as adult action:
the App Store build requires its grown-up check before each AI generation by default, including the
ten-creation free allowance; the feedback device snapshot is opt-in and off-by-default; and image
reports require an explicit gated confirmation that names the evidence being sent (ADR-0104). The
gate protects action boundaries and is not itself legal consent.

### 5.1.4 Kids

> "Apps in the Kids Category or those that collect, transmit, or have the capability to share
> personal information (e.g. name, address, email, location, photos, videos, **drawings**, the
> ability to chat, other personal data, or persistent identifiers used in combination with any of
> the above) from a minor must include a privacy policy and must comply with all applicable
> children's privacy statutes. For the sake of clarity, the parental gate requirement for the Kid's
> Category is generally not the same as securing parental consent to collect personal data under
> these privacy statutes."

**Impact.** Drawings are named personal information, and sending one to OpenAI is a transmission —
so the AI feature exists inside this rule no matter which provider or credential is used. The
guideline's own clarification says the math gate alone is not COPPA consent.

**Decisions.** The consent moment is the parent's deliberate setup (entering a credential or using
the allowance behind the gate they configure), documented in `/privacy` in parent-readable terms; no
accounts, no child name/email/location is ever requested; the free-allowance pseudonym is
app-purpose, one-way, and never combined with other identifiers (ADR-0105); provider retention is
disclosed with both halves stated — not used for training by default, normally kept for 30 days for
abuse monitoring with published exceptions (ADR-0114, commit
7a7cb68c608fdea6358f74535fac86e59f9beda2). The privacy policy and store declarations are audited
against that shipped practice before submission.

### 5.2.1 Intellectual Property

> "Don't use protected third-party material such as trademarks, copyrighted works, or patented ideas
> in your app without permission."

**Impact / decisions.** `web/static/coloring/COLORING-BOOK.md` shipped inside both native bundles
naming Frozen, Bluey, Paw Patrol and others under an "IP" heading; no branded artwork ever shipped,
but the list and the stale store-assets claim were removed (issue 851, "already fixed" set).

### Privacy manifest (upload requirement, not a numbered guideline)

Uploads without a `PrivacyInfo.xcprivacy` fail with **ITMS-91053** before review begins.
`ios/App/App/PrivacyInfo.xcprivacy` declares: no tracking, no tracking domains; the one
required-reason API in the dependency tree (`NSPrivacyAccessedAPICategoryUserDefaults`, reason
`CA92.1`, via `@capacitor/preferences`); and five collected data types — Other User Content,
Customer Support, Other Diagnostic Data, Device ID, and Product Interaction. All five are not
linked, not tracking, and used for App Functionality, matching the nutrition label, the Play Data
safety form, and `/privacy`.

## Google Play — Developer Policy Center

### Families policy — target audience and content

> "Apps designed for babies, toddlers, and preschool children should only have the age group 'Ages 5
> & Under' selected. […] Your app's content that is accessible to children must be appropriate for
> children."

**Impact / decisions.** The Play Console target-audience declaration opts Splotch into the full
Families policy; `store-assets/STORE-LISTING-ANDROID.md` pre-records the declarations, and the IARC
questionnaire is answered from what actually ships ("Do not select 'Everyone' by assumption"). The
AI safety layer (system instruction + orchestrator refusal path, ADR-0023, ADR-0113) is what keeps
AI output child-appropriate; it was chosen over the images endpoint specifically because the
Responses API path refused a red-team fixture the images endpoint rendered.

### Families policy — adult action

> "Adult action means a mechanism to verify that the user is not a child and does not encourage
> children to falsify their age […]. Apps require adult action before enabling features that allow
> children to exchange personal information."

**Impact / decisions.** The multiplication-keypad gate (ADR-0094) is the adult-action mechanism in
front of every personal-information exchange: AI generation, image/refusal reports, and feedback
submission. Android store builds arm all five gate policies to `always` by default.

### Families policy — data practices and identifiers

> "Apps that solely target children must not transmit Android advertising identifier (AAID), SIM
> Serial, Build Serial, BSSID, MAC, SSID, IMEI, and/or IMSI. […] You must disclose the collection of
> any personal and sensitive information from children in your app, including through APIs and SDKs.
> […] Apps that solely target children may not request location permission."

**Impact / decisions.** No identifier on the list is read or transmitted; the app requests only
`INTERNET`, `ACCESS_NETWORK_STATE`, and legacy-scoped `WRITE_EXTERNAL_STORAGE` (maxSdk 28), with no
location permission. The free-allowance installation pseudonym was designed against this rule: an
app-purpose SHA-256 hash, never the raw device identifier, never combined with IP, account,
advertising ID, or fingerprint (ADR-0105). `android:allowBackup="false"` keeps settings and stored
credentials out of cloud backup. Collection that does happen (the allowance pseudonym and
accounting, drawings on tap, reports, and feedback) is disclosed in `/privacy` and the Data safety
form.

### Families policy — APIs and SDKs

> "Apps that solely target children must not contain any APIs or SDKs that are not approved for use
> in primarily child-directed services. […] Only use Google Play Families Self-Certified Ads SDKs to
> display ads to those users."

**Impact / decisions.** No ads or analytics SDKs ship at all, which satisfies the self-certified
list vacuously. No AI SDK ships in the APK either: the OpenAI call happens server-side behind the
`AiImageProvider` seam (ADR-0047, ADR-0113) — the client talks only to Splotch's own API, on BYOK
runs included (`web/src/lib/ai/credentials.ts` sends the key to `/api/generate-image`; the server
uses it for that one request and never stores it).

### Payments policy

> "Play-distributed apps requiring or accepting payment for access to in-app features or services
> must use Google Play's billing system. […] Apps may not lead users to a payment method other than
> Google Play's billing system," including via "language that encourages a user to purchase the
> digital item outside" the app. Consumption-only apps — enter a credential for a service paid for
> elsewhere — are explicitly permitted.

**Impact / decisions.** Splotch sells nothing in-app, so the clean posture is consumption-only: key
entry is fine, payment steering is not. The BYOK how-to's "add a little credit" step and price note
were the steering language and were removed (issue 849, commit
c2ee6446e3a294cd4a55cfc148f37f1f01c8dc04). The remaining OpenAI link targets key management, not a
checkout. A parental gate cures nothing here — this rule is about payments, not child safety — so
the fallback if Play still objects is dropping the link from the Android build, not more gating.

### AI-Generated Content policy

> Apps that generate content via AI ("image or video generated by AI based on text, image, or voice
> prompts") must implement "in-app user reporting or flagging features that allow users to report or
> flag offensive content to developers without needing to exit the app," and user feedback should
> inform content filtering and moderation.

**Impact / decisions.** ADR-0104: every result is labelled "AI-generated picture"; gated "Report
this picture" / "Report this refusal" flows retain evidence only after explicit confirmation, for at
most 30 days (daily purge job), with human review within 24 hours. The Play Console AI declarations
are pre-recorded in `STORE-LISTING-ANDROID.md`: AI-generated content yes, in-app reporting yes,
free-form prompts no.

### Deceptive Behavior policy

> "Your app's functionality should be reasonably clear to users; don't include any hidden, dormant,
> or undocumented features within your app."

**Impact / decisions.** Same finding and fix as Apple 2.3.1: the hidden admin-console reveal is
gone, the console is web-only and unlinked (ADR-0101), and the bundle guard enforces it per build.

### User Data policy — third-party AI integrations

> Play's [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
> holds the developer responsible for third-party integrations, including AI, that receive user
> data.

**Impact / decisions.** The full analysis lives in `android.md` § "Third-party AI integrations":
adult action at generation time, limited use (temporary Splotch jobs; `store: false` on every
provider request, commit 88b0899e5d4bbefe86764cec5b5ae0a2f759dec4), disclosure of both halves of
OpenAI's retention posture, and the under-18 obligations tracked in ADR-0114.

### Data safety form

Play requires the Data safety section to reflect actual practice — "'No data collected' is wrong"
for Splotch. `STORE-LISTING-ANDROID.md` pre-records the answers: data collected yes / shared no
(service-provider transfer to OpenAI, disclosed), photos-and-videos and other-UGC entries with the
30-day confirmed-report retention, Device or other IDs for the one-way allowance pseudonym, App
interactions for allowance and operational generation records, and opt-in diagnostics. It also
records encryption in transit, deletion on request, and the automatic purge.

## Provider obligations that ride along

Store policy holds the developer responsible for the AI provider's terms, so those terms are part of
the compliance surface even though no store wrote them:

* **The provider must permit child-directed use at all.** Gemini's consumer API terms forbid it
  (18+, no services "directed towards" under-18s) with no compliance path, which forced the provider
  swap (issue 845, ADR-0113, commits b646d596e80212beadd86c78417fdf61745ad6b6 and
  e74453e76117c4d8a9dacbbe3576f0fe0aae3503). OpenAI publishes under-18 API guidance that permits it
  subject to conditions.
* **OpenAI's under-18 conditions** are tracked obligation-by-obligation in ADR-0114, each named met
  (filters, reporting, parent disclosure, flagship model) or open. **The single biggest open item:
  zero data retention is an account-level grant OpenAI must approve, not a parameter** — until it
  lands, the provider keeps a 30-day abuse-monitoring copy, and `/privacy` says so plainly rather
  than implying otherwise.

## Provenance

The compliance work arrived in roughly this order (full history for the earliest items sits below
this clone's shallow-fetch boundary at 0f67a3d3fb5cfdc8b9459ce437714f87f96ff6b0; run
`git fetch --unshallow` to recover it):

| Landed                                                                                                        | Where                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adversarial policy pass; tracking issue with 11 sub-issues                                                    | Issue 851 (sub-issues 596, 599, 708, 844–850, 244)                                                                                                                  |
| Admin console made web-only; route exclusion + bundle guard; trademarked list removed; privacy manifest added | Branch `claude/app-store-guidelines-dedup-eruayu` (pre-boundary); ADR-0101                                                                                          |
| Parental gate system, per-feature Parent Center policies                                                      | ADR-0094 (pre-boundary); web defaults amendment in PR 934 (d0fc837e9db15db3379ed1785cce685211f54fdb)                                                                |
| AI image report retention design                                                                              | ADR-0104 (pre-boundary); refusal reports in PR 1032 (7e799c0b55081cfa7809d8b2bcdb37f62028561e); free-tier report tokens in 3d8aaa7e9685cef915cd8a6bebe054fde4c31319 |
| Server-authoritative free grants                                                                              | ADR-0105 (pre-boundary); accounting fixes in 30e5816c188a43b7dad0519038bc350f3e73a1ab                                                                               |
| Feedback publishing moved to a private tracker                                                                | Issue 847; PR 951 (2cb21afc16a505801c0b6e2d84fc9f4f6d2d6d38)                                                                                                        |
| Provider swap Gemini → OpenAI                                                                                 | Issue 845; ADR-0113; b646d596e80212beadd86c78417fdf61745ad6b6                                                                                                       |
| Under-18 obligations named and disclosed; `store: false`                                                      | ADR-0114; 7a7cb68c608fdea6358f74535fac86e59f9beda2, 88b0899e5d4bbefe86764cec5b5ae0a2f759dec4                                                                        |
| Native external links gated, `/privacy` included                                                              | PR 1030 (5b5c1ed60038c152ca54731f3c54d11ad6d61240)                                                                                                                  |
| Beta pages consolidated; Play URLs kept out of the iOS build                                                  | ADR-0112; PR 1034 (ed186a02dbdb69b0804ffc6f8882c89791abfa1d)                                                                                                        |
| Mobile tooling consolidated (bundle guard's current home)                                                     | 661ee3153bd8aff6753cb3923199dad9cd4f2328 → `tools/mobile/check-static-bundle.mjs`                                                                                   |
| BYOK how-to reworded as configuration                                                                         | Issue 849; c2ee6446e3a294cd4a55cfc148f37f1f01c8dc04                                                                                                                 |

**Enforced by tests:** `web/src/lib/state/parentalGate.svelte.test.ts`,
`web/tests/flows-parental-gate.spec.ts`, `web/tests/flows-parent-center-warning.spec.ts`,
`web/tests/ai-report.spec.ts`, `web/src/nativeExcludedRoutes.test.ts`,
`tools/mobile/tests/static-bundle.test.mjs`, `web/tests/admin.spec.ts`,
`web/tests/feedback.spec.ts`, `web/tests/beta.spec.ts`.

**Machine-checked consistency.** `tools/mobile/privacy-permission-inventory.json` declares the
permissions, data categories, ephemeral-by-default / 30-day-on-confirmed-report boundary, and
production outbound-host classes. The tools-tier drift guards compare it with the Android manifest,
iOS usage strings and privacy manifest, the ASC nutrition label, the Play Data safety form,
implementation constants and call sites, and `web/src/routes/privacy/+page.svelte`. The store forms
remain human-submitted from their checklists. Live retention statements in ADR-0104 and ADR-0115 are
included in the drift guard; the remaining ADR detail is design provenance rather than another
declaration to keep aligned by hand.

## Open items

* **Issue 844** — gate the AI, feedback, and about *areas* (not just their links); the load-bearing
  change for Apple 1.3's "designated area" reading.
* **Issue 708** — reduce how many `target="_blank"` links exist in the native bundle at all.
* **OpenAI zero-data-retention grant** — an account-owner action outside this repo (ADR-0114).
* **Submission-time steps** — reviewer access code, review notes on the closed prompt enum, rating
  questionnaires answered from shipped behavior, and re-checking `STORE-LISTING-IOS.md`'s
  pre-committed answers (issue 851).
