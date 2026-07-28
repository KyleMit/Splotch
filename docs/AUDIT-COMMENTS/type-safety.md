# Audit comments — Type safety

29 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `2863093dfbf6` — [listen<K> uses an unused generic and an `(e: never)` cast]

**Issue**

```ts
function listen<K extends keyof WindowEventMap>(
  target: EventTarget, type: K | string,
  handler: (e: never) => void, options?: ...
) { target.addEventListener(type, handler as EventListener, options); ... }
```

`K` is never used to constrain `handler` (the handler is typed `(e: never)`), and `type: K | string`
collapses to `string`, so the generic buys nothing. `(e: never)` plus `as EventListener` defeats
type-checking at every call site — `listen(canvas, 'pointerdown', startDrawing)` gets no
verification that `startDrawing` accepts a `PointerEvent`.

**Fix**

refactor(drawing): type listen() with target-keyed overloads

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071308393) · 2026-07-24
15:04:22 UTC</sub>

### `879521f3eb28` — [P2][type-safety] Replace the stringly-typed style with a `StyleName` union

**Issue**

The style is untyped end to end: `STYLE_SUFFIXES: Record<string, string>` (styles.ts:5),
`STYLE_NAMES = Object.keys(...)` yields `string[]` (styles.ts:22),
`buildPromptForStyle(style: unknown, …)` (prompt.ts:8),
`generateAiImage({ style = '' }: { style?: string })` (aiImage.ts:95), and
`handleSelectStyle(style: string)` (AiImagePrompt.svelte:39). A typo in a style name compiles fine
and silently falls back to the base prompt. The set of valid styles is a fixed enum but the compiler
enforces nothing.

**Fix**

refactor(ai): type styles as a StyleName union across client call sites

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309985) · 2026-07-24
15:04:32 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### b3ff01256b9a — [P2][type-safety] `SetupInstructions` passes OS around as bare `string`, losing the `'ios'|'android'` union

**Issue**

`setupOsList` is a `$derived` that produces `string[]` (`:47-53`, elements are string literals with
no annotation), and every consumer is typed `os: string`: `lockTitle(os: string)` (`:55`) and the
snippets `installSteps(os: string)` (`:91`), `lockSteps` (`:112`), `exitSteps` (`:136`). The whole
file then branches on `os === 'ios'` string comparisons. A typo (`'IOS'`, `'andriod'`) compiles fine
and silently falls through to the Android branch, and there's no exhaustiveness guarantee.

**Fix**

Added a local `type SetupOs = 'ios' | 'android'` in SetupInstructions.svelte, annotated the
`setupOsList` `$derived` as `SetupOs[]`, and changed `lockTitle` plus the
`installSteps`/`lockSteps`/`exitSteps` snippets to take `os: SetupOs` — so a typo like `'iOS'` is
now a compile error instead of silently falling through to the Android branch. Defined the union
locally rather than reusing `InstallDeviceOs` or `Platform`, since both carry a third value
(`'desktop'`/`'web'`) that would type-check its way into these OS-specific branches. Type
annotations only; no markup, branch logic, or call sites changed.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075023104) · 2026-07-24
22:22:01 UTC</sub>

### 44e84d59882d — [P4][type-safety] Stroke sizes are numerically typed (`number`) where a `1|2|3|4|5` union would prevent invalid levels

**Issue**

`STROKE_SIZES = [1,2,3,4,5]` is `number[]`, `SIZE_TO_PX: Record<number, number>`, and every function
takes `size: number`. Nothing at the type level constrains a caller to a valid level, so
`getStrokeWidthPx(7)` type-checks and silently falls back
(`SIZE_TO_PX[size] ?? SIZE_TO_PX[DEFAULT_SIZE]`, line 59). The valid domain is a fixed five-value
set — ideal for a union.

**Fix**

Replaced the plain `number` type for stroke sizes with a `StrokeSize = 1 | 2 | 3 | 4 | 5` literal
union in `strokeWidth.svelte.ts`, threading it through `SIZE_TO_PX`, `strokeState`, `setStrokeSize`,
`getStrokeWidthPx`/`getEraserWidthPx`, and the `StrokeWidthMenu`/`ActionsPanel` component
props/handlers, so invalid sizes like `getStrokeWidthPx(7)` are now caught at compile time instead
of silently falling back at runtime. Widened `readInt`'s `allowed` param to `readonly number[]` in
`storage.ts` to accept the now-readonly `STROKE_SIZES`, and added `as StrokeSize` casts at the
storage-read boundary and on the test's four intentionally-invalid literals (which still exercise
the runtime fallback guard).

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075037514) · 2026-07-24
22:24:00 UTC</sub>

### 5c573afc0337 — [P5][type-safety] `buttonChips` uses an inline structural type with stringly-typed ids

**Issue**

The `buttonChips` array is declared with a large inline object type
(`{ id: string; label: string; icon: CommonIconName; checked: () => boolean; toggle: (next: boolean) => void }[]`).
The `id: string` is really a DOM/test id (`'strokeWidthToggle'`, etc.) with no constraint, and the
closure-per-chip `checked: () => boolean` pattern is a slightly unusual reactivity workaround worth
a named type so the intent is discoverable and reusable (the ControlsSection chip grid and any
future settings chip grid share the shape).

**Fix**

Extracted the inline structural type for `buttonChips` in ControlsSection.svelte into a named local
`SettingChip` interface declared directly above it, per the brief's anti-premature-abstraction
guidance (no shared types file since only one call site exists). Type-only change; check, unit
tests, and eslint all pass clean.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076313633) · 2026-07-25
02:13:49 UTC</sub>

## PR [\#542](https://github.com/KyleMit/Splotch/pull/542) — Cut the audit burndown over to run cloud-native (+ 7 findings) (2026-07-25)

### d19213245946 — [P2][type-safety] StrokeWidthMenu casts a template-string icon name to CommonIconName, defeating the generated union

**Issue**

```svelte
<Icon name={`${erasing ? 'eraser-size' : 'size'}-${size}` as CommonIconName} class="action-icon" />
```

The whole point of the generated `name` union (svelte.md:23-26) is that a missing or misnamed icon
is a compile error. The `as CommonIconName` cast erases that guarantee: if `size-6` or
`eraser-size-2` is added to `STROKE_SIZES` without a matching icon, `npm run check` stays green and
the icon silently fails to paint at runtime.

**Fix**

Stroke-size icon names now come from two `Record<StrokeSize, CommonIconName>` literal maps in
`strokeWidth.svelte.ts` instead of a runtime template string cast in the menu, so a renamed or
deleted size SVG fails `npm run check` at the map rather than rendering nothing. Confirmed by
temporarily deleting `size-3.svg` and regenerating the icon union — the type error surfaced in
`strokeWidth.svelte.ts`, and the icon was restored before committing.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078508261) · 2026-07-25
12:38:19 UTC</sub>

### a1ee4c98b493 — [P3][type-safety] SplotchyIcon's open-ended prop bag spreads arbitrary attributes with an `unknown` index signature

**Issue**

```ts
interface Props {
  class?: string;
  [key: string]: unknown;
}
let { class: className = '', ...rest }: Props = $props();
```

`...rest` is spread onto the `<span>` with a fully permissive `[key: string]: unknown`, so any
typo'd or invalid attribute passes typechecking and lands on the DOM node. Callers pass
`aria-hidden`, but nothing constrains the surface. Compared with the strongly-typed `Props` in
Slider/Breadcrumb/ErrorScreen, this is the odd one out.

**Fix**

Replaced SplotchyIcon's `[key: string]: unknown` prop bag with
`Props extends HTMLAttributes<HTMLSpanElement>`, so a misspelled attribute on a `<SplotchyIcon>`
usage is now a type error instead of silently landing on the `<span>`. The brief anticipated that
`SectionIcon`'s permissive `rest` spread would then fail to typecheck, but it doesn't, so per the
brief's conditional step 2 I left `SectionIcon.svelte` and `Icon.svelte` alone — worth noting the
hole isn't fully closed for attributes routed through `SectionIcon`.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078510532) · 2026-07-25
12:39:12 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 0e086112bfa8 — [P2][type-safety] `COLOR_ICONS` is an untyped `Set<string>` — stale/typo entries can't be caught by the compiler

**Issue**

```ts
export const COLOR_ICONS = new Set([
  'camera', 'crayon', 'eraser', ...
]);
```

The set is inferred as `Set<string>`, so nothing ties its 24 entries to the `CommonIconName` union.
A misspelled entry (`'camara'`), or an entry for an icon that was later renamed/deleted (see the
`sweep-icon` orphan above), compiles clean and silently does nothing — the icon it was meant to
protect renders wrongly tinted. `COLOR_ICONS.has(name)` on line 68 also accepts any string. The
runtime test (`Icon.svelte.test.ts`) only checks the *forward* direction (every colorful SVG is
present); a stale/typo'd extra entry is invisible to both compiler and test.

**Fix**

Annotated `COLOR_ICONS` as `Set<CommonIconName>` and moved the type-only `CommonIconName` import
into the `<script module>` block so it is in scope there, making every allowlist literal
compile-checked against the generated icon union. Contrary to the brief's "no other call site needs
to change", `Icon.svelte.test.ts:37` did break: it feeds glob-derived `string` names to
`COLOR_ICONS.has()`, so that argument is now cast to `CommonIconName` (the glob mirrors the
component's own, so the names are exactly that union).

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5079900775) · 2026-07-25
18:27:54 UTC</sub>

### 959522d58ffc — [P3][type-safety] `Icon` `Props` index signature `[key: string]: unknown` defeats prop checking

**Issue**

```ts
interface Props {
  name: CommonIconName;
  class?: string;
  [key: string]: unknown;
}
let { name, class: className = '', ...rest }: Props = $props();
```

The catch-all index signature turns every unlisted prop into `unknown`, then `{...rest}` sprays them
onto the `<span>`. A caller can pass `<Icon name="pen" onclik={...} widht={20} />` (typos) and
TypeScript stays silent. It also allows arbitrary attributes with no relation to what a `<span>`
accepts, and weakens the guarantee the generated `name` union is supposed to provide. Compare
`Button.svelte`, which extends the typed `HTMLButtonAttributes` for exactly this reason.

**Fix**

Replaced `Icon.svelte`'s hand-rolled `Props` interface — whose `[key: string]: unknown` catch-all
let any typo'd prop type-check and get sprayed onto the rendered `<span>` — with
`interface Props extends HTMLAttributes<HTMLSpanElement>`, matching the pattern `Button.svelte`
already uses. `class` now comes from `HTMLAttributes`, and `data-*` attributes still compile via
that type's own `data-${string}` index signature, so no call site needed adjusting.

*Revised before approval:* Addressed the review point on d68ba2e034ea78b3a56142322b61e63cf660b7f8.
Dropping `class?: string` had widened `class` to `HTMLAttributes`' `ClassValue | undefined | null`
while the span still string-interpolates it (`class="{className}{colorClass}"`), so
array/object/null class values type-checked and rendered as `a,b` / `[object Object]` / `null`.

Fix: restored `class?: string;` inside `Props` (narrowing the inherited `ClassValue`), matching the
sibling `SplotchyIcon.svelte` which does exactly this over the same
`HTMLAttributes<HTMLSpanElement>`. Chose that over the `class={[className, colorClass]}` array form
because the array form changes the rendered `class` attribute string, and the finding's acceptance
criteria required unchanged markup. Added a short comment recording why the narrowing exists, so it
isn't deleted again as redundant.

Verified with a throwaway probe component (deleted before committing): `widht={1}`,
`class={['a','b']}`, `class={{active:true}}` and `class={null}` all now produce type errors, while
`class="x"`, `aria-label`, `aria-hidden`, `role` and `data-brush-face` still compile. Gates after
removing the probe: `npm run check` 928 files / 0 errors, `npm run test:unit` 58 files / 638 tests
pass, eslint on the changed file clean. Working tree clean.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/components/Icon.svelte:61-63` — removing `class?: string` from `Props` widens `class`
  to `HTMLAttributes`' `ClassValue | undefined | null`, but line 74 still string-interpolates it
  (`class="{className}{colorClass}"`), so `class={['a','b']}`, `class={{active:true}}` and
  `class={null}` now type-check and render `a,b` / `[object Object]` / `null`. Restore
  `class?: string;` inside the `Props` interface (the sibling `SplotchyIcon.svelte` does exactly
  this over the same `HTMLAttributes<HTMLSpanElement>`), or switch the span to the array form
  `class={[className, colorClass]}` as `design/Button.svelte` does.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5079909111) · 2026-07-25
18:28:36 UTC</sub>

## PR [\#546](https://github.com/KyleMit/Splotch/pull/546) — Audit burndown: clear the staged docs/AUDIT.md backlog (2026-07-25)

### c16b44127f04 — [P4][type-safety] `removeToken` lacks the empty-input guard `addToken` has, and re-annotates the filter callback

**Issue**

`addToken` rejects empty input up front (`:169`,
`if (!t) return { ok: false, error: 'Token cannot be empty' }`), but `removeToken` silently accepts
`''`/whitespace, runs a full read-modify cycle, finds no match, and returns `{ ok: true }`. The
asymmetry isn't wrong but is unexplained — a reader can't tell whether removing "" is intentionally
a no-op or an oversight. Separately, `list.filter((x: string) => x !== t)` (`:186`) carries a
redundant `: string` annotation (`list` is already `string[]`), a small inconsistency with the rest
of the module.

**Fix**

Added a one-line comment inside removeToken's transform (web/src/lib/server/tokens.ts) explaining
that empty/no-match input falls into the same no-op path as any unmatched token, rather than being a
missing validation guard — no behavior change, since adding an actual guard (like addToken's) would
turn today's no-op response into an error for existing callers with no test or requirement for that.

**Adversarial review** — approved on the first pass; no changes needed.

> **Supervising note:** the finding's second half was already stale — the redundant `: string`
> annotation on the filter callback had been removed by earlier work, so only the documentation half
> was live at HEAD. The fix is correct for what remained.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081115248) · 2026-07-25
23:58:47 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### dc5fea20e0c5 — [P3][type-safety] `ai-timer` uses `0` as a sentinel for "no pending timeout" instead of `null`

**Issue**

```js
let pending: ReturnType<typeof setTimeout> | 0 = 0; // setTimeout id for the scheduled "finish"
```

`ReturnType<typeof setTimeout>` is `number` in the browser, and `0` is a valid-looking (falsy)
member of that type, so the union `| 0` and the `if (pending)` truthiness check conflate "no timer"
with "a timer whose id is 0." It works only because browser timer ids are positive, an
implementation detail. The idiomatic sentinel is `null`.

**Fix**

Changed the `pending` timeout handle in `/dev/ai-timer` from a `| 0`-sentinel to `| null`, with
`clearPending()` now testing `pending !== null` instead of truthiness, so "no timer scheduled" no
longer relies on browser timer ids never being `0`. Behavior is unchanged; `play()`, `finishNow`,
`fail`, and `reset` all schedule and cancel exactly as before.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081731838) · 2026-07-26
03:04:48 UTC</sub>

### fa2e6974bf66 — [P4][type-safety] The engine harness types its public API seam as `Record<string, unknown>`, discarding the real engine signatures at the test boundary

**Issue**

```js
interface EngineHarnessWindow {
  __engineState: { canUndo: boolean; canvasEmpty: boolean };
  __engine: Record<string, unknown>;
  __engineReady: boolean;
}
```

`__engine` is assigned a rich object of typed engine functions (`setColor`, `exportCanvasBlob`,
`strokeSync`, …) but typed as `Record<string, unknown>`, so nothing checks that the harness exposes
what the Playwright spec expects, and the spec sees `unknown`. A rename in `engine.ts` won't surface
here.

**Fix**

Extracted the harness's `__engine` window object literal into a `buildEngineApi()` function and
typed the interface field as `ReturnType<typeof buildEngineApi>` instead of
`Record<string, unknown>`, so a wrong/renamed member at this seam now fails `npm run check` instead
of type-checking silently. All members, closures, and comments preserved unchanged;
`web/tests/global.d.ts` untouched per the brief.

*Revised before approval:* Addressed both review points on dd62fd8: annotated
`buildEngineApi(): Window['__engine']` to bind the harness's return type to the ambient contract in
web/tests/global.d.ts (verified this now catches a renamed member via svelte-check), and added the
missing `setMagicMode` to that ambient declaration. check/eslint/unit/named E2E specs all pass;
committed as 469c07a.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/routes/dev/engine/+page.svelte:30` — `__engine: ReturnType<typeof buildEngineApi>` is
  self-referential: the type is inferred from the very expression assigned to it, so it constrains
  nothing and cannot catch a wrong or renamed member. The contract that actually has to match is the
  hand-written `Window.__engine` declaration in `web/tests/global.d.ts` (which the specs compile
  against and which already intersects into `win` here, so the pre-change `Record<string, unknown>`
  was no weaker). Bind the two — e.g. annotate `function buildEngineApi(): Window['__engine']` — so
  a harness member that drifts from the spec-facing contract errors at the harness.
* `web/tests/global.d.ts` — the ambient `Window.__engine` declaration omits `setMagicMode`, which
  the harness exposes and `scripts/perf/replay-scenario.mjs` reaches through `window.__engine`; that
  omission is exactly the drift the finding describes and this commit leaves it in place. Add it
  (and any other exposed member missing there) when binding the harness return type to the ambient
  declaration.

**E2E gate** — `tests/engine.spec.ts tests/multitouch.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081895614) · 2026-07-26
03:57:32 UTC</sub>

### 5e3f9568693b — [P5][type-safety] `app.d.ts` leaves `App.Error`, `Locals`, `PageData`, `PageState` as commented-out stubs while a concrete error shape is already in use

**Issue**

The `App.Error` interface is left commented (defaulting to `{ message: string }`), yet both hooks
return exactly that shape and could return a richer one (e.g. an error id). Leaving the namespace as
default-stub is fine functionally but means the app's error contract isn't declared where SvelteKit
expects it, and a future richer error object would be untyped until someone remembers this file.

**Fix**

Declared `App.Error { message: string }` in web/src/app.d.ts to document the contract both
`handleClientError` and `handleServerError` already satisfy, leaving Locals/PageData/PageState as
unused stubs per the brief. Type-check, eslint on the file, and the full unit suite (682 tests) all
pass; no runtime behavior changed.

*Revised before approval:* Removed the unused `// interface Locals/PageData/PageState {}` stubs from
web/src/app.d.ts (confirmed no references anywhere in web/src) and added a comment on the new
`App.Error` interface pinning it to hooks.client.ts's and hooks.server.ts's `handleError` return
shape, matching the style of the Platform comment below it. Type-check, eslint on the file, and the
full unit suite (682 tests) all pass.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/app.d.ts:6-8` still leaves the `// interface Locals {}`, `// interface PageData {}`,
  `// interface PageState {}` placeholders, which the finding asked to remove if genuinely unused.
  They are unused — the repo has no `event.locals` reference anywhere in `web/src`, and no
  `pushState`/`replaceState` from `$app/navigation` (the only hits are `history.replaceState` in
  `lib/pwa/updates.ts` and `lib/state/settings.svelte.ts`, which don't use `App.PageState`). Delete
  all three commented lines.
* The new `interface Error { message: string }` in `web/src/app.d.ts` carries no comment, so it is
  indistinguishable from the SvelteKit default it restates and invites deletion by the next reader.
  Add a short comment recording the contract it pins — that `handleError` in both `hooks.client.ts`
  and `hooks.server.ts` returns `{ message: GENERIC_ERROR_MESSAGE }` — matching the commented style
  used for `Platform` directly below it.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082090374) · 2026-07-26
04:52:25 UTC</sub>

### 3fab7963993e — [P3][type-safety] Share one `Origin`/point type instead of redefining `{x,y}` per action

**Issue**

`guardLaunchZone` takes `Origin | null`, but `modalDialog` declares its `origin` as an inline
`{ x: number; y: number } | null` and passes it straight in (`guardLaunchZone(o.origin ?? null)`).
It compiles only because the shapes coincide. The same `{x:number;y:number}` shape is also
independently spelled as `Point` (`aiPreview.ts`) and as an inline `{ x: number; y: number }` map
value in `pinchTextZoom`. Four spellings of one 2D-point concept.

**Fix**

`ModalOptions.origin` in `web/src/lib/actions/modalDialog.svelte.ts` now references the `Origin`
type imported from `$lib/state/modal.svelte` instead of respelling `{ x: number; y: number }`
inline, so the shape it hands to `guardLaunchZone(origin: Origin | null)` is declared as the same
type rather than merely coinciding with it. Type-only change; the two other duplicates the finding
cited were already removed by an earlier pinch-gesture refactor, as the brief notes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082224079) · 2026-07-26
05:38:04 UTC</sub>

### 3e26d2a31254 — [P3][type-safety] `initPencilEraser` swallows a rejected `addListener` promise

**Issue**

```ts
PencilEraser.addListener('doubleTap', handleDoubleTap).then((h) => {
  if (removed) h.remove();
  else handle = h;
});
```

The `.then` has no `.catch`. If the native `addListener` bridge rejects (plugin not registered,
bridge not ready), it becomes an unhandled promise rejection with no diagnostic, and `handle`
silently stays `undefined` so the returned cleanup is a no-op. The floating promise is also the kind
of thing `no-floating-promises` lint targets.

**Fix**

Added a `.catch` to the `PencilEraser.addListener` promise in `initPencilEraser()` so a failed
native subscription logs via `console.error` instead of surfacing as an unhandled rejection — the
gesture is non-fatal and the function returns a synchronous cleanup, so there is nowhere to
propagate it. Covered it with a new native-iOS test that drives `isNative()`/`getPlatform()` through
a hoisted mock toggle (defaulting off, leaving the existing web-fallback tests untouched) and stubs
`addListener` to reject; confirmed the test fails against the pre-fix code.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082333823) · 2026-07-26
06:17:31 UTC</sub>

## PR [\#549](https://github.com/KyleMit/Splotch/pull/549) — Continue audit burndown with Codex (2026-07-26)

### f57a52536b7c — [P3][type-safety] The hex-center record type is declared inline twice

**Issue**

`{ color: string; cx: number; cy: number }[]` is written out for both the `hexCenters` field
(line 23) and `snapshotHexCenters`'s local (line 61). The shape is duplicated; a field rename must
touch both.

**Fix**

Added a local `HexCenter` interface and reused it for both cached-center arrays, eliminating the
duplicated record shape without changing runtime behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/549#issuecomment-5083439872) · 2026-07-26
12:21:02 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### fb80f92e482f — [P2][type-safety] The secure-storage object store holds two incompatible value shapes under `any` — a `CryptoKey` and `{ iv, data }` payloads with no discriminant

**Issue**

The single `secrets` store keeps the raw non-extractable `CryptoKey` under `MASTER_KEY_ROW` *and*
every secret as `{ iv, data }` under its name. `idb`'s `db.get` returns `any`, so
`const existing = await db.get(STORE, MASTER_KEY_ROW)` (line 68) is untyped and `record.iv` /
`record.data` (line 103) are unchecked property accesses on `any`. Nothing at compile time stops a
future edit from reading a payload row as a key or vice versa, and the stored payload shape has no
named type despite being the app's on-disk secret format.

**Fix**

Parameterized lazy IndexedDB connections by schema and defined secure storage’s mixed
CryptoKey/payload contract. Payload guards now reject malformed secret rows, while master-key reads
treat payload-shaped rows as absent without disturbing race-safe key creation.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084373842) · 2026-07-26
16:32:13 UTC</sub>

### aada7eca1542 — [P3][type-safety] `lazyIdbDatabase` returns an unparameterized `IDBPDatabase`, forcing `any` on every consumer

**Issue**

The factory returns `() => Promise<import('idb').IDBPDatabase>` with no `DBSchema` generic, so
`db.get`/`db.put`/`db.delete` are all `any` at every call site. That `any` is the root of the
secure-storage payload type weakness (separate finding) and the untyped `FileSystemDirectoryHandle`
round-trip in folderSave — the store contents are entirely unchecked.

**Fix**

Added a local IndexedDB schema for the folder-save handle store and applied it to `lazyIdbDatabase`,
so directory-handle reads and writes are type-checked without changing persistence behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084375268) · 2026-07-26
16:32:34 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 35060a4cb0a4 — [P3][type-safety] `readJsonBody`'s return type misrepresents `request.json()`

**Issue**

`readJsonBody` is typed `Promise<Record<string, unknown> | null>`, but `request.json()` can resolve
to an array, string, number, boolean, or `null`. The `| null` is the only non-object case
acknowledged, and the JSDoc even leans on this ("a JSON primitive or array simply yields no matching
fields") — but the declared type asserts callers get an object-or-null, so `body?.code` on a JSON
*array* body type-checks yet the runtime value isn't what the type implies. It's a soft `any`
dressed as a `Record`.

**Fix**

Changed JSON body parsing to return `unknown`, added explicit object narrowing for direct field
access and admin string fields, and verified valid arrays remain parsed but are not treated as
records. This preserves all existing malformed-body and endpoint-specific validation responses.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084856705) · 2026-07-26
18:39:34 UTC</sub>

### 4f669c39fe90 — [P3][type-safety] `BeforeInstallPromptEvent` requires a cast because `WindowEventMap` isn't augmented

**Issue**

The event type is declared locally, then the listener callback receives a plain `Event` and casts:

```ts
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;   // cast
```

The `as` cast defeats type-checking at the exact boundary where the shape matters, and
`'appinstalled'` is likewise untyped. `app.d.ts` already augments global types (File System Access
API), so this is the established pattern for exactly this situation.

**Fix**

Moved the Chromium install-prompt event type into the global declarations and typed both install
events through `WindowEventMap`. The eager listener now retains its inferred prompt event directly,
eliminating the cast without changing runtime behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086069417) · 2026-07-27
00:11:04 UTC</sub>

### 77363853cbd2 — [P4][type-safety] Save-Data `connection` type is cast inline instead of shared

**Issue**

```ts
const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
```

The `NetworkInformation` shape is declared ad-hoc at the use site, and the test re-declares the same
shape when stubbing `navigator.connection`. The non-standard API has no shared type, so the two
definitions can drift and neither is discoverable.

**Fix**

Added shared Save-Data navigator typings and used them for the registration gate, preserving its
literal-true behavior. Test cleanup now removes the declared navigator property directly.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/pwa-registration.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086071153) · 2026-07-27
00:11:25 UTC</sub>

### f882f381693e — [P3][type-safety] The `'light' | 'dark'` theme union is re-typed in `pageThumb` instead of a shared `ResolvedTheme`

**Issue**

`resolvedTheme(): 'light' | 'dark'` and `pageThumb(page, orientation, theme: 'light' | 'dark')` each
spell the union inline; `DrawingCanvas` compares `resolvedTheme() === 'dark'` in several places.
There's no `type ResolvedTheme`, so the two-value theme vocabulary isn't greppable and can't be
extended in one place.

**Fix**

Added the canonical `ResolvedTheme` type to the pure theme module and applied it to every named
consumer. `ThemePreference` now extends that shared vocabulary while runtime behavior remains
unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086074076) · 2026-07-27
00:12:00 UTC</sub>

### 008b1e695026 — [P3][type-safety] `playDrawSound`'s param is a loose inline type named `movementData` — should share the engine's `DrawSoundData`

**Issue**

```ts
export function playDrawSound(movementData: { speed?: number } = {}) { … const { speed = 0 } = movementData; … }
```

The engine defines `interface DrawSoundData { speed: number }` and always calls
`onDrawSoundCallback({ speed })`, but `playDrawSound` accepts a *different*, looser inline shape
(`speed?` optional, whole arg optional) and re-defaults `speed`. The two definitions can drift
silently, and the name `movementData` overpromises — the object carries only a speed. It reads as a
leftover from a richer former signature.

**Fix**

Exported the engine’s required `DrawSoundData` payload and made `playDrawSound` consume it directly.
This removes the duplicate optional/default shape so the engine and audio callback contracts cannot
drift.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086078362) · 2026-07-27
00:12:50 UTC</sub>

### 0c2dd9096c70 — [P3][type-safety] `getPlatform()` casts an arbitrary string to `Platform` without validating

**Issue**

```ts
export function getPlatform(): Platform {
  if (!browser) return 'web';
  return (globalThis.Capacitor?.getPlatform?.() ?? 'web') as Platform;
}
```

`Capacitor.getPlatform()` is typed `string`; the `as Platform` promises it's one of
`'android' | 'ios' | 'web'` with no runtime check. A future Capacitor platform (or a shimmed
environment) would be silently mistyped, and downstream `PLATFORM_LABEL[platform]` / branch logic
would be reasoning about a lie.

**Fix**

Validated Capacitor’s runtime platform string so only `android` and `ios` pass through, with every
other value safely mapped to `web`. Added isolated unit coverage for supported platforms, the
unknown-value fallback, and an unavailable Capacitor global.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086078970) · 2026-07-27
00:12:57 UTC</sub>

### 4393a7046e0d — [P3][type-safety] `PLATFORM_LABEL` typed `Record<string, string>` defeats exhaustiveness against `Platform`

**Issue**

```ts
const PLATFORM_LABEL: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android' };
```

Keyed by `string`, so TypeScript won't flag a missing platform or a typo'd key, and the
`?? platform` fallback at line 24 silently papers over a gap. The union `Platform` already exists
two imports away.

**Fix**

Typed `PLATFORM_LABEL` as `Record<Platform, string>` using the existing platform union, making
supported labels exhaustive while preserving the current runtime fallback and collected values.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086079338) · 2026-07-27
00:13:01 UTC</sub>

### 6d9c11997c23 — [P4][type-safety] `currentGain!` non-null assertion in `playDrawSound`

**Issue**

```ts
rampGainTo(currentGain!.gain, target, ctx.currentTime, GAIN_RAMP_S);
```

The `!` asserts `currentGain` is set. It's true today (the `if (!currentSource)` block always
assigns `currentGain` alongside `currentSource`, and the early `if (!ctx || !buffers) return` guards
the rest), but the invariant "`currentSource` set ⟺ `currentGain` set" is implicit across two
branches — a refactor that sets one without the other would crash at runtime past the compiler. It's
the kind of coupled-nullable pair the factory refactor (P2 above) would let you model as a single
non-null object.

**Fix**

Replaced the independently nullable source and gain variables with one nullable playback object,
making active-node ownership atomic and removing the non-null assertion. Creation, gain ramping,
fade-out, and node disconnection behavior are preserved.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/webkit-smoke.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086082161) · 2026-07-27
00:13:36 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### a193d1f7cd64 — [P4][type-safety] Scorer return shapes are undocumented ad-hoc objects with no JSDoc typedefs

**Issue**

These `.mjs` modules return richly-structured objects (`scoreEyeFill` →
`{ eyes, cores: [{ x, y, coreLuma, bandDark, bandLight, contrast, lively, annulusInkFrac }] }`) that
downstream code and `golden-catalog.mjs` index by convention (`pupil.coreDarkFrac`,
`lightCore.annulusInkFrac`). Nothing declares these shapes, so a renamed field or a `null` vs `0`
mismatch (e.g. `judgeNightEyes` reading `nightCore.contrast`) is caught only at runtime, and callers
can't discover the contract without reading the whole function.

**Fix**

Added JSDoc `@typedef`/`@returns` blocks to `scoreEyeFill`, `scoreCompositeEyes`, `scoreNightHalo`,
and `outlineMatch` documenting their return shapes, matching the fields the brief specified;
comment-only, no runtime changes. Unit tests, asset-gen tests, and eslint on the four files all
pass; `npm run check` was intentionally not used as a gate per the brief's correction.

*Revised before approval:* Added `HaloBandStat` (`d`, `n`, `med`, `p90`, `p99`, `rimShare`,
`haloShare`) and `HaloHotspot` (`left`, `top`, `haloPx`) JSDoc typedefs in night-halo.mjs and
referenced them from `HaloScore.bandStats`/`hotspots`, replacing the bare `object[]` placeholders.
eslint and `npm run test:asset-gen` both pass.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `tools/asset-gen/lib/night-halo.mjs:77-78` declares `bandStats` and `hotspots` as bare `object[]`,
  leaving undocumented exactly the nested shapes the finding is about — the module itself indexes
  `bandStats[0].n` / `.haloShare` / `.rimShare`, and `bin/audit-night-halo.mjs:59-60` re-emits both.
  Add `@typedef`s for the band entry (`d`, `n`, `med`, `p90`, `p99`, `rimShare`, `haloShare`) and
  the hotspot entry (`left`, `top`, `haloPx`) and reference them from `HaloScore`, matching the
  field-level detail given to `EyeCoreScore` and `PupilScore`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086207330) · 2026-07-27
00:41:27 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### 36a7dc9a11c6 — [P3][type-safety] `jsSelfTime` keys functions by tab-joined string, then splits on tab

**Issue**

Self-time is aggregated by building `const key =` ${name}\t${loc}`` (line 185) and later recovered
with `const [name, loc] = key.split('\t')` (line 190). If a `functionName` from the CPU profile ever
contains a tab (or the split yields more than two parts), the name/location are silently mis-split.
The contract on the parsed V8 profile is also loose: `profile.nodes`, `profile.samples`,
`e.args?.data?.timeDeltas` are read positionally (`samples[i]` ↔ `deltas[i]`) with only
`Math.max(0, deltas[i] || 0)` guarding a length mismatch, so a short `timeDeltas` array under-counts
without warning.

**Fix**

Replaced tab-delimited self-time identities with collision-safe structured entries, preserving exact
function/location text and aggregation. Malformed profiles now fail clearly on sample/delta count
mismatches, with focused regression coverage for both cases.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090795155) · 2026-07-27
11:35:42 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### b99c23a317f9 — [P2][type-safety] Native page hand-rolls type guards that duplicate the server's response shape

**Issue**

The `{ ok, tokens, invites, persistent }` snapshot contract lives authoritatively in
`tokens/+server.ts`'s `snapshot()`, but `/admin/native` re-describes it as a hand-written inline
guard annotation, and `login()` parses its response as untyped `any` (`data?.ok`, `data?.session`).
A field added server-side never surfaces as a client type error. Proposed: export `TokenSnapshot` /
`LoginResponse` wire types from the endpoints, type the guard as `value is TokenSnapshot`, and type
the login parse against the response union.

**State at triage (2026-07-27):** The finding fully holds at HEAD. None of the draft landed:

* `web/src/routes/api/admin/tokens/+server.ts` — `snapshot()` (line 43) and `mutationError()` (lines
  …

**Fix**

Shared the admin login and token response types between endpoint producers and the native consumer
while preserving runtime validation and wire behavior. Added handler-level integration coverage that
pins every specified response shape and confirms mutation errors never expose their server-only
reason.

*Revised before approval:* Restored the nullish login fallback so malformed failure responses
without an `error` field still display “Sign in failed.” instead of clearing the error state.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/routes/admin/native/+page.svelte:145` regresses the generic login fallback: a malformed
  failure body such as `{ ok: false }` now assigns `undefined` to `loginError`, whereas the previous
  code displayed “Sign in failed.” Preserve the nullish fallback with
  `(data && !data.ok ? data.error : null) ?? 'Sign in failed.'`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099778757) · 2026-07-28
04:00:45 UTC</sub>
