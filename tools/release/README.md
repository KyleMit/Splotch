# Release tooling

This capability turns an approved `releases/<version>.md` document into the application release
notes and version changes, cuts the Git/GitHub release, and later verifies and attaches the native
store artifacts. The committed release Markdown is the source of truth for every generated note.

## Entry points

| Entry point                     | Public command                       | Purpose                                                                                         |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `cut-release.mjs`               | `npm run release <version>`          | Version, commit, tag, and optionally publish                                                    |
| `gen-release-notes.mjs`         | `npm run gen:releases`               | Regenerate app and store release notes                                                          |
| `build-native-release.mjs`      | `npm run android:*`, `npm run ios:*` | Build the React Native app's store `.aab` / `.xcarchive` / `.ipa`, or its `.dev` Release `.apk` |
| `publish-release-artifacts.mjs` | `npm run release:publish`            | Verify and attach built `.aab` / `.ipa` files                                                   |

The public commands remain stable during the tools naming migration. The `cut-release`, `build`, and
`publish-artifacts` skills own the human approval and signed-build workflow around these scripts.

## Generate release notes

`gen-release-notes.mjs` needs installed project dependencies and the committed `releases/*.md`
files; it is deterministic and uses no network. It parses and sorts the release documents, then
writes the in-app JSON/current/full-history components and Fastlane Android/iOS changelogs. It runs
automatically before web and native builds.

```sh
npm run gen:releases
```

Do not hand-edit the generated application components or store changelogs. Edit the matching release
Markdown and regenerate them so all targets retain one source of truth.

## Cut a release

`cut-release.mjs` requires a valid `releases/<version>.md` whose frontmatter `version` matches its
filename. It updates the Android and iOS versions and `package.json`, regenerates release notes,
commits the release set, and tags it. The release set is exact: the three version files, the release
document, and the files `gen-release-notes.mjs` writes (`releaseNoteOutputPaths()`). A committing
run refuses any other changed or untracked path before its first write and again before it commits,
and refuses a version file that differs from `HEAD` by more than the version bump. The normal mode
also needs authenticated Git and GitHub access because it pushes the commit/tag and creates the
GitHub Release. `npm run release` additionally runs the `prerelease` hook first
(`check:coloring-assets` + `check:assets:manifest`), so a stale asset manifest fails the release
before any file is touched; invoking the script directly skips those checks.

```sh
npm run release 1.6.0 -- --dry-run
npm run release 1.6.0 -- --no-publish
npm run release 1.6.0
```

`--dry-run` updates release files without Git actions; everything it changes is in the release set,
so the real cut of the same version can follow it. `--no-publish` commits and tags locally but does
not push or create the GitHub Release. Unknown flags fail closed so a misspelled safety flag cannot
fall through to publishing. This command deliberately never attaches native artifacts: the new
version must be committed before a correctly versioned binary can be built.

## Build native artifacts

The stores ship the React Native app in `.`; `tools/release/lib/native-app.mjs` names its identity,
projects, and artifact paths. `build-native-release.mjs` deletes a target's previous output, then
runs Gradle or `pod install` and `xcodebuild` in the app's project. Store identity is opt-in:
Gradle's `splotch.store` property and `ios/Store.xcconfig` are the only switches from
`art.splotch.app.dev` to `art.splotch.app`, and the `bundle`, `archive`, and `ipa` targets are their
only callers. The `apk` target is the Release-optimized `.dev` app for installing beside the store
copy. `tools/release/tests/native-app.test.mjs` fails when the native projects stop declaring that
identity or another package script reaches the opt-in.

```sh
npm run android:bundle   # needs android/keystore.properties
npm run ios:ipa          # needs ios/local.xcconfig
```

## Publish native artifacts

`publish-release-artifacts.mjs` needs an existing GitHub Release, authenticated `gh`, and at least
one built native artifact. It reads the embedded app ID and version from the Android bundle and iOS
archive, compares them with `art.splotch.app`, `package.json`, and the pinned Android version code
in the release document, and refuses mismatches before uploading anything.

```sh
npm run release:publish -- --dry-run
npm run release:publish -- --only=android --dry-run
npm run release:publish
```

Pass an explicit semver to publish a version other than `package.json`; use `--only=android` or
`--only=ios` for a deliberate single-platform upload. Uploads use GitHub's clobber behavior only
after every selected artifact passes its embedded app ID and version checks.

## Retain released coloring-pack files

Released Capacitor builds address coloring assets by a versioned manifest and exact SHA-256.
ADR-0103's retention obligation survives deletion of that build pipeline: keep every addressed
legacy asset byte reachable while those releases remain supported.

`gen:coloring-pack-snapshot` is a **historical-tag reconstruction tool**. It extracts the selected
tag's own `web/coloringPackManifest.ts` generator and `web/static/coloring` tree with `git archive`,
then records the resulting download-path/digest pairs. Those paths belong to the tag's layout. Use
it only for a historical pack-shipping tag that contains that generator, not for a new RN tag.

```sh
npm run gen:coloring-pack-snapshot -- --ref v1.6.0
npm run check:coloring-pack-retention
```

The existing snapshots and `lib/coloring-pack-retention.mjs` inventory remain enforced by
`tests/coloring-pack-retention.test.mjs`. The check hashes current `assets/static` against every
recorded release; where historical tags are available, it also detects a missing legacy snapshot.

RN releases bundle Farm as native assets (ADR-0181) and use the integrity catalog in
`src/offlineLibrary/` for additional books. They do not ship the historical manifest generator, so
no new snapshot is produced by that command. The RN catalog and platform download owners define
their addressed bytes; replacing hosted art still requires preserving bytes that supported installed
releases address.

`RELEASED_PACK_BROKEN_FILES` is the committed release inventory. The check fails when a listed
release has no snapshot or a snapshot has no entry, so a lost snapshot fails CI even though CI's
checkout has no tags. Each entry holds the release's exact unserved-file count: 0 for a healthy
release. A release already broken on the live origin keeps its nonzero count, so both a further
deletion and a partial restore fail until the pin is updated. A nonzero pin is an open defect, not
an exemption. Retiring or regenerating an addressed asset needs the old bytes to stay reachable at
the old path; `check:coloring-assets` separately rejects unreferenced files under
`assets/static/coloring`, so that retention cannot be done by leaving stale files beside the current
catalog.

## Libraries and failure behavior

`lib/release-frontmatter.mjs` owns frontmatter, the version-matches-filename rule, semver ordering,
and deep writes; `lib/native-version.mjs` owns reading and editing the React Native app's
Android/iOS project versions; `lib/artifact-version.mjs` owns embedded native-artifact inspection
(the aapt2 protobuf scan, the `plutil` plist read, and the `.aab`/`.ipa` version semantics);
`lib/aab-r8-mapping.mjs` requires Android's embedded R8 compiler metadata and class mappings before
publishing (including a dry run); and `lib/zip.mjs` owns ZIP container parsing beneath it, exposing
read-only `readEntry`. Keep version parsing and validation in these owned modules rather than
duplicating it in entry points.

The R8 mapping guard rejects unmapped bundles even when their version matches. It does not measure
performance or prove all optimizer settings: the native release configuration tests pin code and
resource shrinking, and a toolchain change also needs effective-configuration inspection and a
Release APK runtime smoke.

`lib/zip.mjs` is deliberately bounded to reading a trusted build artifact: no writing, no streaming,
and no zip64 (an archive using the zip64 sentinel is rejected rather than misread). Widening that
scope is the point at which a dependency would start to earn its place.

Malformed release Markdown, invalid flags, missing files, dirty unrelated paths, failed Git/GitHub
commands, missing artifacts, and version mismatches produce diagnostics and nonzero exits. Release
cutting is intentionally not transactional across filesystem, Git, and GitHub state: when a command
fails, inspect `git status`, the tag, and the GitHub Release before retrying. Artifact publishing
verifies every selected binary before the first upload, preventing a partial set caused by a later
version mismatch.

Run focused verification with:

```sh
npm run test:tools -- tools/release/tests
npm run gen:releases
```
