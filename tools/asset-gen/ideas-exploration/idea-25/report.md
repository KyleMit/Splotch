# Idea #25 — Light-mode byte-stability check in CI

**Verdict: WORKED** — implemented end-to-end, validated in both directions, 0 Gemini calls, fully
offline.

## Design decision: manifest hash file, not commit-message-scoped CI check

The idea offered two variants. I chose the **committed manifest** (`gen:assets:manifest` writes a
hash file; `check:assets:manifest` verifies it in CI) and rejected the commit-message-scoped check,
for repo-grounded reasons:

1. **No commit-message convention exists to hook onto.** Nothing in the repo (CLAUDE.md, ADRs, CI)
   defines a "night-only pass" commit trailer. A message-scoped check would have to invent one, and
   it dies on squash merges, multi-topic PRs, and rebases. `.github/workflows/test.yml` also has no
   path-filtered jobs, so "asset PRs" are not currently distinguishable in CI.
2. **The repo already has the exact precedent for the manifest shape.** `img:audit` /
   `img:audit:check` is a generator + `--check` drift-guard pair, with the check running as a step
   in the `Quality` job of `test.yml`. The manifest variant is the same pattern applied to binary
   art.
3. **Strictly more coverage.** The message-scoped variant only fires when someone *declares* a night
   pass. The manifest guards **every** change to **every** committed art asset: it converts silent
   binary churn into a reviewable one-line-per-file text diff. A night pass that accidentally
   re-encodes a light file either fails CI (manifest not regenerated) or shows a `*.light.webp` hash
   line in the PR diff (manifest regenerated) — both are catches.
4. **Synergy with idea #23 (golden-set score fixtures).** #23 explicitly flagged that a
   score-identical asset swap is invisible without a content-hash column. This manifest **is** that
   column: two fills can tie on `keep`/`localKeep`; their sha256 can't collide. Together they cover
   "scores drifted" (#23) and "bytes swapped under identical scores" (#25).

### Scope decision

The manifest hashes all `**/*.webp` under three trees (682 files at baseline 8e471b8):

| Tree                          | Why                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `web/static/coloring/**`      | the shipped art — outline/chalk/light/night/thumb per page                                                                     |
| `web/static/styles/*.webp`    | shipped style covers                                                                                                           |
| `tools/asset-gen/fill-src/**` | committed source-of-truth raws — a night pass legitimately rewrites `*.night.raw.webp` but must never touch `*.light.raw.webp` |

SVGs are excluded (already guarded by `img:audit:check`); gitignored `.coloring-samples*/` scratch
is outside the hashed trees by construction.

### Format decision

`tools/asset-gen/asset-manifest.sha256`, plain text, one `<sha256>␠␠<repo-relative-path>` line per
asset, sorted by path, LF, trailing newline. This is `sha256sum`-compatible (bonus: `sha256sum -c`
works on unix) but the cross-platform verifier is the script's `--check` mode (ADR-0017 — plain
Node, no bash-isms). Paths use forward slashes (`replaceAll('\\','/')`) so the file is
byte-identical when generated on Windows. `.sha256` and `package.json`/`*.yml` are outside
Prettier's scope (`.prettierignore`), so `format:check` is unaffected.

## Implementation

One script, `tools/asset-gen/gen-asset-manifest.mjs` (it imports `lib/paths.mjs`, so it lives inside
`tools/asset-gen/` like the sibling pipeline tools), with a `--check` flag — mirroring the
`image-audit.mjs` pattern. Uses `glob` from `node:fs/promises` like the sibling scripts (CI is Node
24).

npm wiring per ADR-0019 (`namespace:variant`, generated artifact under `gen:*`, guard under
`check:*`, both with `scripts-info` entries, placed in the check/gen groups next to `check:assets`
and `gen:contact-sheet`):

```json
"check:assets:manifest": "node tools/asset-gen/gen-asset-manifest.mjs --check",
"gen:assets:manifest": "node tools/asset-gen/gen-asset-manifest.mjs",
```

scripts-info:

* `gen:assets:manifest`: "Rewrite tools/asset-gen/asset-manifest.sha256 (sha256 per committed art
  asset: coloring pages, style covers, fill-src raws) so binary asset changes review as text diffs;
  verified in CI by check:assets:manifest"
* `check:assets:manifest`: "CI guard for gen:assets:manifest: fail if any committed art asset's
  bytes drifted from tools/asset-gen/asset-manifest.sha256 (e.g. a night pass touched a light file);
  run gen:assets:manifest and commit to fix"

`--check` reports three drift classes with exact paths — `CHANGED` (hash mismatch), `ADDED` (on
disk, not in manifest), `REMOVED` (in manifest, gone from disk) — then exits 1 with a fix-it message
naming `npm run gen:assets:manifest`.

Everything is in **`code/asset-manifest-check.patch`** (verified with `git apply --check` on the
pristine tree). The generated manifest is included in the patch and as evidence at
`asset-manifest.sha256` beside this report (`manifest-run1.sha256` is the identical first-run copy
used for the determinism comparison and diffs below).

## Validation transcripts

### (a) Determinism — regenerate twice, byte-identical

```
$ node tools/asset-gen/gen-asset-manifest.mjs
[asset-manifest] wrote 682 asset hash(es) to tools/asset-gen/asset-manifest.sha256
$ cp tools/asset-gen/asset-manifest.sha256 manifest-run1.sha256
$ node tools/asset-gen/gen-asset-manifest.mjs        # second run
[asset-manifest] wrote 682 asset hash(es) to tools/asset-gen/asset-manifest.sha256
$ cmp tools/asset-gen/asset-manifest.sha256 manifest-run1.sha256 && echo DETERMINISTIC
DETERMINISTIC: run1 == run2 byte-identical
$ node tools/asset-gen/gen-asset-manifest.mjs --check
[asset-manifest] 682 asset(s) match the manifest.
```

### (b) Accidental light-byte change during a "night pass" — caught, exactly one file

Simulated by sharp round-trip re-encoding `farm/dog-wide.light.webp` (visually identical, bytes
differ — precisely the failure mode the invariant guards):

```
re-encoded web/static/coloring/farm/dog-wide.light.webp -> 89212 bytes
$ node tools/asset-gen/gen-asset-manifest.mjs --check
[asset-manifest] CHANGED (hash mismatch): web/static/coloring/farm/dog-wide.light.webp
[asset-manifest] 1 asset(s) drifted from the manifest. If the change is intentional, run
`npm run gen:assets:manifest` and commit it — the diff shows exactly which assets changed
(a night-only pass must not touch any *.light/*.outline/*.thumb line).
exit code: 1
```

Exactly the touched file, nothing else. After restoring the original bytes:
`[asset-manifest] 682 asset(s) match the manifest.`

### (c) Legitimate night change — manifest diff localizes it

Re-encoded `farm/dog-wide.night.webp` (standing in for a real night-fill regen), then ran
`gen:assets:manifest`. Manifest diff against the previous manifest:

```
342c342
< 910c56a9be12aeaa5e625fff5a3d45e5e2e1a4c734f0d02df0be76542cf7b3cc  web/static/coloring/farm/dog-wide.night.webp
---
> dd395ef039399910693edbb920708511a967567c7c3ee8f500d42a6924afdbc0  web/static/coloring/farm/dog-wide.night.webp
```

One night line changed; grep across the diff for `\.(light|outline|thumb)\.webp` → **0 light-side
lines changed**. This is the reviewable "night pass touched zero light bytes" proof the idea asked
for, as a plain text diff in the PR.

### (d) Bonus: ADDED/REMOVED detection

```
[asset-manifest] ADDED (not in manifest): web/static/coloring/farm/stray-page.light.webp
[asset-manifest] REMOVED (still in manifest): web/static/coloring/farm/pig-tall.thumb.webp
[asset-manifest] 2 asset(s) drifted from the manifest. ...
exit: 1
```

### npm/tooling wiring verified

`npm run check:assets:manifest` and `npm run gen:assets:manifest` both run through npm;
`npm run info` lists both new scripts-info entries; `eslint` and `prettier --check` pass on the new
script; the modified `test.yml` parses as valid YAML.

## CI wiring (in the patch)

Added to the `Quality` job of `.github/workflows/test.yml`, directly after the analogous SVG-audit
drift guard. Runtime: hashing 682 webp files takes ~1–2 s, no new deps, so it runs on every PR — no
need to distinguish "asset PRs" (which the workflow currently has no mechanism for anyway):

```yaml
# Asset byte-stability guard: fails if any committed art asset (coloring
# pages, style covers, fill-src raws) changed without regenerating
# tools/asset-gen/asset-manifest.sha256 — turns silent binary churn into a
# reviewable text diff. Guards the invariant that a night-only fill pass
# leaves light-mode bytes untouched. Fix with `npm run gen:assets:manifest`.
- name: Asset manifest check
  run: npm run check:assets:manifest
```

## Limitations

* **The check enforces manifest freshness; the light-invariant judgment stays human.** CI fails on
  *any* un-manifested asset change, intentional or not. When the author regenerates the manifest, CI
  goes green — the reviewer must still notice a `*.light.webp` hash line in a PR that claims to be
  night-only. The check's contribution is making that line *exist* (binary webp diffs are otherwise
  invisible in review). A stricter declared-scope check would need the commit-message convention
  this design rejected.
* **One-command friction per asset change:** every legit generate/retouch now requires
  `npm run gen:assets:manifest` before commit. The CI failure message says exactly this.
* Scoped to `*.webp` in the three art trees; icons/SVG/PNG elsewhere are out of scope (SVGs have
  their own guard).
* `prerelease` still runs only `check:assets`; chaining `check:assets:manifest` there is a natural
  follow-up.

## Recommendations

1. Adopt the manifest variant as-is (`code/asset-manifest-check.patch`).
2. If #23's golden score fixtures also land, note in both docs that the pair closes each other's
   blind spot (scores without bytes / bytes without scores).
3. Mention `gen:assets:manifest` in `tools/asset-gen/pipeline.md`'s shipping runbook (after re-punch
   \+ contact sheet: regenerate the manifest) — left out of the patch as a docs judgment call for
   the adopting session.
