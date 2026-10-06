# Common-horizon burden preregistration, revised decision policy

**Status: proposed until original Claude review and integration.**

Parent-owned documentation unit; the
[original proposal](evidence/burden-preregistration/original-proposal.md.txt) and full Claude
round-one findings remain immutable in its evidence directory. This revision resolves the arithmetic
before any remedy or candidate comparison. No estimate is measured saving, and no architecture is
selected.

The common horizon H is 24 months beginning at the reviewed foundation decision. An effort-week is
one person's concentrated engineering implementation, validation and review effort; agent
concurrency and calendar waiting do not change the unit. Source-change frequencies are overlapping
path subsets, not complete maintenance incidents or engineering hours. The
[compact factual receipt](evidence/burden-preregistration/source-facts.json.txt) pins
ef3d1eb2070c1bd0dee620ed42a2b14201c2a9b4: 1,246 first-parent commits from 2026-07-08 through
2026-10-06 15:00 UTC, with product UI 467, dependencies 341, native bindings 118, web/security 97
and validation/release 880 touching their finite path subsets. The
[disposition](evidence/burden-preregistration/source-facts-disposition.json.txt) preserves old
counts and exact corrections. The [evidence index](evidence/burden-preregistration/README.md)
records original plan/review inputs and reproduction limits.

## Fixed selection arithmetic

For arm a and each of the five mandatory categories c, I[a,c] is the remaining initial-work range,
R[a,c] is the recurring effort range for a fully deployed 24 months, D[a] is deployment/retirement
delay in months, and Q[a] is one combined risk-reserve range. R[retention,c] is the same fixed
baseline for every candidate. All are coarse estimates until evidence supports their attribution.
Use upper or lower endpoints exactly as named below.

The cost side uses the arm's ABSOLUTE remaining initial work. Do not subtract retention's initial
work or net away common tests. Mandatory final physical, continuity, privacy,
supported-source/channel and release gates belong to I for every arm. The initial validation row
differs because a replacement has additional integrated surfaces; being mandatory does not make
equal effort known.

Let f[a] = max(0, (H - D[a].upper) / H). For category c, let delta[a,c] = R[retention,c].lower -
R[a,c].upper. Positive delta is eligible only when reviewed feasibility evidence names an actual
recurring owner/obligation that can retire by D[a].upper within H. Until then use min(0, delta),
keeping all estimated added costs and granting no unsupported positive credit. Retirement need not
have happened before selection. Actual retirement later governs realised credit; delay exceeding the
preregistered bound invalidates the claim rather than resetting the horizon.

The lower-bound saving is f[a] multiplied by the sum of those category deltas. The transition cost
upper bound T[a] is D[a].upper / H multiplied by the sum of R[a,c].upper. This deliberately charges
the candidate its full recurring upkeep rate during overlap, in addition to initial implementation.
Initial I covers construction and qualification; T covers maintaining a second evolving
product/tool/service owner and synchronising fixes during the wait. The retention baseline itself
runs during that period in both the retention and migration scenarios and cancels; charging it again
would double-count a common baseline. No candidate upkeep may silently disappear into that
cancellation. The T formula stays fixed. Reviewed changed scope or retirement feasibility can amend
the underlying ranges with preserved reasons and sources; it cannot silently remove transition
upkeep.

Cost upper bound = sum_c I[a,c].upper + Q[a].upper + T[a]. Burden-only eligibility requires
lower-bound saving STRICTLY GREATER than that cost, plus removal of at least one demonstrated
recurring obligation and no uncompensated regression in any mandatory category. Positive net effort
cannot compensate for any failed product, runtime/resource, continuity or release contract.

The original proposal separated initial and recurring reserves. This revision adds them, without
reducing either: Q is 8–24 for retention, 14–36 for native paper, and 20–52 for each whole UI
replacement. Q appears once on the cost side; R contains no reserve. Common horizon, delay
endpoints, cost convention and reserve cannot be reset to qualify a preferred result.

## Remaining initial work

These retain the original five disjoint initial-work estimates; past campaign/experimental work is
excluded. Columns are UI/drawing/input/history/export; tools/dependencies/floors;
services/lifecycle/upgrades; web/security/PWA/accessibility; integrated
tests/physical/privacy/release, in effort-weeks.

| Arm                                 | UI    | Tools | Services | Web  | Validation | Combined reserve | Delay months |
| ----------------------------------- | ----- | ----- | -------- | ---- | ---------- | ---------------- | ------------ |
| Svelte/Capacitor retention          | 0–4   | 0–2   | 2–8      | 0–2  | 8–20       | 8–24             | 0–6          |
| Svelte with native paper            | 6–18  | 2–6   | 4–12     | 0–2  | 8–24       | 14–36            | 3–12         |
| RN with shared web UI               | 12–32 | 4–12  | 6–18     | 4–12 | 12–28      | 20–52            | 6–18         |
| RN mobile with Svelte web           | 12–32 | 4–12  | 6–18     | 0–4  | 12–28      | 20–52            | 6–18         |
| Flutter shared UI                   | 16–40 | 4–12  | 6–18     | 6–18 | 12–28      | 20–52            | 6–18         |
| Separate native UIs with Svelte web | 20–48 | 4–12  | 6–18     | 0–4  | 12–28      | 20–52            | 6–18         |

The unaccepted faithful renderer and web vocabularies explain UI uncertainty; unexecuted same-ID
reads and signed-channel upgrades explain services; unqualified native installs/builds/floors
explain tools. Complete final gates remain for retention as well. These are planning ranges, not
delivery promises or confidence intervals.

## Recurring effort and obligation changes

The five columns are UI/behavior synchronization; tools/dependencies/floors; native
bindings/order/lifecycle/upgrades; web/security/PWA adapters; tests/physical/privacy/release. All
ranges cover a fully deployed 24 months. Revised LOWER endpoints allow plausible
direct-binding/shared-vocabulary savings rather than encoding retention's dominance twice. The
original upper endpoints remain: none of those savings is demonstrated. This is an explicit
round-one amendment, not observed candidate performance.

| Arm                                 | UI    | Tools | Bindings | Web  | Validation |
| ----------------------------------- | ----- | ----- | -------- | ---- | ---------- |
| Svelte/Capacitor retention          | 2–8   | 4–12  | 4–12     | 2–8  | 8–20       |
| Svelte with native paper            | 2–10  | 4–18  | 3–18     | 2–8  | 8–24       |
| RN with shared web UI               | 1–12  | 3–20  | 2–20     | 2–14 | 8–28       |
| RN mobile with Svelte web           | 8–24  | 6–24  | 2–20     | 2–8  | 10–28      |
| Flutter shared UI                   | 1–18  | 3–20  | 2–20     | 3–18 | 8–28       |
| Separate native UIs with Svelte web | 12–36 | 6–24  | 2–18     | 2–8  | 10–32      |

Retention keeps its single Svelte UI, browser paper, Capacitor/plugin bridge and existing
validation/release owners. It may retire a proved unnecessary diagnostic/harness or avoidable repair
owner only after that owner's requirements transfer. Its baseline includes actual continued
dependency, floor, binding and release obligations, not zero future upkeep.

Native paper could retire the native WebView paper/input/rendering owner only, while keeping the web
drawing engine, Svelte UI and Capacitor services. It adds collector/renderer bindings, bridge
command/layer ordering and platform surface lifecycle. A viable production design with identical
accepted collector/backend/paper semantics, interaction/coherence proof and transferred paper
coverage determines retirement; a causal RN island does not imply keeping every experiment
dependency in production.

RN shared UI could retire native Capacitor/WebView UI/bridge ownership and the Svelte product UI
after real React-web recovery/vocabulary and full web contracts transfer. SvelteKit
backend/API/admin, web security/PWA and the web paper remain unless separately replaced and proven.
It adds RN/React-web coordination, direct native bindings, compiler/bundler/floor qualification and
web adapters. Those removals require complete applicable consumers, continuity and released
installation/build evidence; package count is not proof.

RN mobile with retained Svelte web could retire native Capacitor/WebView-host/binding owners but
retains Svelte web and adds a second product UI with behavior synchronization, RN tooling and direct
OS service ownership. Shared models alone do not retire either UI. Complete native contracts and
actual same-ID migration plus two-UI change/validation obligations determine its ranges.

Flutter shared UI conditionally could retire native Capacitor/WebView and Svelte product UI, but
keeps the backend/API/admin and adds Dart/TypeScript behavior and canvas/DOM/web-adapter ownership,
plus Flutter/native floors and plugins. A complete exercised shared UI, faithful paper/web host,
services and upgrade transfer must support any retirement claim.

Separate native UIs could retire native Capacitor/WebView, but add Swift and Kotlin UIs,
synchronization with retained Svelte, two native binding/release paths and independent
accessibility/floor upkeep. Its lower direct-binding estimate is conditional; the multiple UI owners
are an explicit cost. Full product and continuity coverage must transfer before retirement.

Validation lower bounds acknowledge some shared proof can remain while removing a particular old
host seam. Upper bounds account for new collectors, renderer/service consumers, floor and channel
matrices. No arm removes physical or signed upgrade/release obligations merely by choosing a
framework. Web lower bounds reflect shared backend/security retention, with larger adapter
uncertainty for new web vocabularies. Tools lower bounds allow removal of one native bridge graph,
while upper bounds include new framework/floor coordination. Every credited revision names the
retired owner, surviving/new obligations, evidence and exact source.

## Candidate choice and limits

Lower DEMONSTRATED recurring burden requires evidence-backed nonoverlapping aggregate recurring
bounds after the same category/retirement rules; overlapping estimate-only ranges prove neither arm
cheaper. Among eligible native candidates, the contract's viable native-paper hybrid default applies
unless RN shows lower demonstrated burden or passes the separately preregistered additional-benefit
exception. Burden-only differences that remain uncertain favor lower-change retention.

Before seeing comparative timing, the physical materiality registration must include the arm-to-arm
burden difference and its concrete added tool/bridge/UI/release owners, their compensation and
feasible upkeep budget, alongside fresh within-OS variability, owning action budgets and
whole-screen visible/readiness. Engineering effort is not converted to milliseconds by an invented
exchange rate. The RN exception must satisfy both the calibrated mechanism-benefit threshold and
explicit justification/compensation for extra recurring owners; an unresolved burden inventory
cannot be waived by timing. This document does not set that later threshold without physical
calibration.

With current overlapping estimate-only ranges and no reviewed retirement-feasibility proof, no
burden-only migration qualifies. For native paper, I.upper=62, Q.upper=36, recurring upper=78,
D.upper=12, T=39, so cost upper=137 effort-weeks; the baseline recurring lower is20 and saving
lower=(20−78)/2=−29. RN shared UI has I.upper=102, Q.upper=52, recurring upper=94, D.upper=18,
T=70.5 and cost upper=224.5; its saving lower=(20−94)/4=−18.5. Endpoint arithmetic is illustrative
decision policy, not measured precision. No failed structural candidate or unproved observer becomes
a negative timing result.

Only reviewed changed scope or feasibility evidence can amend remaining ranges. Preserve original
values, reason, exact source and review identity; do not revise reserve or horizon to force
eligibility. Remedy/comparison execution stays ineligible until this preregistration is reviewed and
committed. Structural compilation and independent source/host qualification remain eligible.
