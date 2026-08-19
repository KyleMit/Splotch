# Release tooling

This capability turns an approved `releases/<version>.md` document into the application release
notes and version changes, cuts the Git/GitHub release, and later verifies and attaches the native
store artifacts. The committed release Markdown is the source of truth for every generated note.

## Entry points

| Entry point                     | Public command              | Purpose                                       |
| ------------------------------- | --------------------------- | --------------------------------------------- |
| `cut-release.mjs`               | `npm run release <version>` | Version, commit, tag, and optionally publish  |
| `gen-release-notes.mjs`         | `npm run gen:releases`      | Regenerate app and store release notes        |
| `publish-release-artifacts.mjs` | `npm run release:publish`   | Verify and attach built `.aab` / `.ipa` files |

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

`cut-release.mjs` requires a clean working tree outside the declared release artifacts and a valid
`releases/<version>.md`. It updates Android and iOS versions, updates `package.json` and its
lockfile, regenerates release notes, commits the complete release set, and tags it. The normal mode
also needs authenticated Git and GitHub access because it pushes the commit/tag and creates the
GitHub Release. `npm run release` additionally runs the `prerelease` hook first
(`check:coloring-assets` + `check:assets:manifest`), so a stale asset manifest fails the release
before any file is touched; invoking the script directly skips those checks.

```sh
npm run release 1.6.0 -- --dry-run
npm run release 1.6.0 -- --no-publish
npm run release 1.6.0
```

`--dry-run` updates release files without Git actions. `--no-publish` commits and tags locally but
does not push or create the GitHub Release. Unknown flags fail closed so a misspelled safety flag
cannot fall through to publishing. This command deliberately never attaches native artifacts: the
new version must be committed before a correctly versioned binary can be built.

## Publish native artifacts

`publish-release-artifacts.mjs` needs an existing GitHub Release, authenticated `gh`, and at least
one built native artifact. It reads embedded versions from the Android bundle and iOS archive,
compares them with `package.json` and the pinned Android version code in the release document, and
refuses mismatches before uploading anything.

```sh
npm run release:publish -- --dry-run
npm run release:publish -- --only=android --dry-run
npm run release:publish
```

Pass an explicit semver to publish a version other than `package.json`; use `--only=android` or
`--only=ios` for a deliberate single-platform upload. Uploads use GitHub's clobber behavior only
after every selected artifact passes its embedded-version check.

## Libraries and failure behavior

`lib/release-frontmatter.mjs` owns frontmatter, semver ordering, and deep writes;
`lib/native-version.mjs` owns Android/iOS project version edits; and `lib/artifact-version.mjs` owns
embedded native-artifact inspection. Keep version parsing and validation in these owned modules
rather than duplicating it in entry points.

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
