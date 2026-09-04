# ADR-0077: Three-Phase Shipping (Release → Build → Publish) with Version-Verified Artifact Upload

**Status:** Active **Date:** 2026-07

## Context

Shipping Splotch used to be two phases. `npm run release <version>` bumped every version location,
committed, tagged, pushed, and created the GitHub Release; `build` then compiled the signed `.aab`
and `.ipa`. To get the bundle onto the GitHub Release, `release.mjs` attached whatever sat at
`android/app/build/outputs/bundle/release/app-release.aab` at the moment it ran:

```js
if (existsSync(RELEASE_AAB)) {
  ghArgs.push(RELEASE_AAB);
  console.log('Attaching built release bundle: app-release.aab');
} else {
  console.log('(no app-release.aab found — run `npm run android:bundle` first to attach it)');
}
```

**That ordering cannot work, and the guidance built on it made it worse.** The artifact for version
N can only be built *after* the commit that sets the version to N — which is the very commit
`release.mjs` creates. So at `gh release create` time, the only `.aab` that can possibly exist is
one built for an **earlier** version. The `existsSync` branch treats "a file is at this path" as
"the bundle for this release is ready", and the two are never the same thing. The then-named
`release` skill compounded it by telling the agent to build *before* releasing to get the attachment
— producing a bundle for the previous version, which is exactly the file that then got attached.

This shipped. Cutting **v1.4.0** on 2026-07-28 attached an `app-release.aab` built on 2026-06-22 —
`versionName 1.2.0`, `versionCode 4` — to the v1.4.0 GitHub Release. Two releases stale, published
publicly, and silent: the log line read `Attaching built release bundle: app-release.aab`, which is
true and tells you nothing. A stale `.ipa` for 1.2.0 was sitting in `ios/App/build/ipa/` too and
would have gone the same way had iOS attachment existed. Store submissions were unaffected (Play and
the App Store read `fastlane/`, not the GitHub asset), so the blast radius was anyone downloading
the binary from GitHub — but nothing in the pipeline would ever have caught it.

Two independent defects, and fixing either alone leaves the failure reachable:

1. **Ordering** — the release phase has no point at which a correct artifact exists.
2. **Trust** — the upload identified an artifact by *path*, and a path says nothing about version.

## Decision

**Split shipping into three ordered phases, and make the upload verify what it is uploading.**

| Phase      | Command                                         | Produces                                         |
| ---------- | ----------------------------------------------- | ------------------------------------------------ |
| 1. Release | `cut-release` → `npm run release <version>`     | version bump, tag, notes, GitHub Release (empty) |
| 2. Build   | `build` → `npm run android:bundle` / `ios:ipa`  | the signed `.aab` / `.ipa` for that version      |
| 3. Publish | `publish-artifacts` → `npm run release:publish` | those artifacts attached to the release          |

**`release.mjs` attaches nothing, unconditionally.** Not "attaches if fresh" — there is no fresh
artifact to find, so the check itself is what had to go. An empty GitHub Release at the end of phase
1 is the correct state, and both the script output and the `cut-release` skill say so, so the gap
does not read as a failure someone should "fix" by reintroducing the attach.

**`scripts/publish-artifacts.mjs` verifies every artifact against the release before uploading**,
reading the version out of the binary itself rather than trusting the path:

* `.aab` — inflates `base/manifest/AndroidManifest.xml` from the zip and reads the `versionName` and
  `versionCode` attributes out of the aapt2 protobuf.
* `.ipa` — inflates `Payload/*.app/Info.plist` and reads `CFBundleShortVersionString` /
  `CFBundleVersion` via `plutil`.

Both are checked against `releases/<version>.md`. Any mismatch **refuses the whole upload** and
names the offending file, its version, and the rebuild command. Fail-closed: an unreadable artifact
is refused too, and there is deliberately no override flag. `--only=android|ios` covers the
legitimate case of one platform being unbuildable (iOS needs macOS + Xcode) without weakening the
check.

Version reading is dependency-free — `scripts/lib/artifact-version.mjs` walks the zip central
directory and inflates with `node:zlib`. An `.aab`/`.ipa` is a plain zip, and the repo carries no
zip library; adding one for this would land in `devDependencies` under the inverted split (ADR-0070)
and buys nothing over ~90 lines.

## Consequences

**Good.**

* The failure is now unreachable, by two independent mechanisms: there is no stale artifact present
  during phase 1, and phase 3 refuses one if there is. Either alone would have caught v1.4.0.
* The check is on the *artifact*, not the workflow, so it also catches failure modes that have
  nothing to do with ordering — a Gradle build that silently no-ops and leaves the old file, an
  `xcodebuild -exportArchive` that reuses a stale archive. `build` now runs the same dry-run
  verification for exactly this reason, rather than reporting success because a file exists.
* `versionCode` is checked alongside `versionName`, catching a rebuild at the same semver with a
  bumped build number — which store uploads reject and a name-only check would miss.
* Re-publishing is safe and is the documented fix for a wrong asset (`gh release upload --clobber`).

**Costs.**

* Shipping is three commands instead of two, and the GitHub Release is briefly binary-less between
  phase 1 and phase 3. Accepted: the alternative is a release that is never briefly wrong because it
  is permanently wrong.
* An artifact built but never published is a new way to end up with no binary on the release.
  `build` ends by pointing at `publish-artifacts` to close that.
* Verifying an `.ipa` needs `plutil`, so it is macOS-only. Not a real constraint — building one
  requires Xcode anyway — but Android publishing stays fully cross-platform.
* The protobuf read is a targeted scan for two leaf fields, not a real decoder. It is pinned by
  `scripts/tests/artifact-version.test.mjs` against a synthetic manifest built to the same byte
  layout, and would fail loudly (`no versionName`) rather than silently if aapt2 ever changed shape.

## Alternatives considered

* **Keep the attach in `release.mjs`, but check the version there.** Cheapest fix, and it would have
  blocked v1.4.0 — but it can only ever refuse, because the correct artifact provably cannot exist
  yet. It converts a silent wrong upload into a guaranteed failed one, leaving the release with no
  binary and no path to attach one. The ordering has to change regardless.
* **Build inside `release.mjs`, between the commit and `gh release create`.** Correct in principle,
  and rejected: it welds minutes of Gradle/Xcode onto the tagging step, makes `--dry-run` and
  `--no-publish` incoherent, fails the whole release when a signing key is missing, and cannot
  produce an `.ipa` on Linux at all. Tagging is fast and reversible; building is neither.
* **Clean the output directory before building.** Removes the specific stale file but not the class:
  path-based trust still can't tell a fresh artifact from a leftover, and a no-op build after a
  clean leaves *nothing*, which the `existsSync` branch reports as "run `android:bundle` first" — a
  friendlier version of the same guess.
* **Compare the artifact's mtime against the tag date.** A proxy for the fact we actually want, and
  wrong in both directions (rebuilds without version changes, restored files, clock skew). The
  version is embedded in the binary; read it.
* **Sidecar `version.json` written next to the artifact by the build script.** Simpler than parsing
  the binary, but it describes the artifact instead of being read from it — a hand-run `gradlew
  bundleRelease`, or any stale sidecar/artifact pairing, reintroduces the gap. The value has to come
  out of the bytes being uploaded.
