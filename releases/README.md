# Release notes

Each release is one Markdown file in this folder, named for its semver version (`1.2.0.md`). **These
files are the single source of truth** for the version number and the release notes. Everything else
is generated from them:

| Target                                 | Generated artifact                                             |
| -------------------------------------- | -------------------------------------------------------------- |
| In-app Settings ("What's New")         | `web/src/lib/releases.json` + generated current-note component |
| Web/native changelog                   | generated full-history component at `/changelog`               |
| Google Play "What's new"               | `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` |
| App Store "What's New in This Version" | `fastlane/metadata/en-US/release_notes.txt`                    |
| GitHub Release                         | the file body, via `gh release create`                         |
| App version                            | `package.json`, Android `build.gradle`, iOS `project.pbxproj`  |

## File format

```markdown
---
version: 1.2.0
date: 2026-06-10
androidVersionCode: 3
---

## ✨ New

* A new thing

## 🚀 Improved

* A better thing

## 🛠 Fixed

* A fixed thing
```

`version` is semver and must match the filename. `date` is a real calendar date in exact
`YYYY-MM-DD` form. `androidVersionCode` is a monotonic integer filled in by the release script.

The body is free Markdown. Headings become section labels in the plain-text store changelogs; list
items become `•` bullets. Keep the Android changelog under **500 characters** (the script warns if
the latest release exceeds it).

The same body also appears in the complete changelog bundled on web, Android, and iOS. Keep the full
history intact and qualify platform-limited features with `(web)`, `(Android)`, or `(iOS)`. Do not
name a platform marketplace: `gen:releases` rejects Google Play, Play Store, and App Store copy
because it would also ship inside the other platform's binary.

## How to cut a release

Shipping is **three ordered phases** — release, build, publish (ADR-0077). The order matters: an
`.aab`/`.ipa` can only carry a version that is already committed, so the release phase deliberately
creates the GitHub Release with **no artifacts attached**, and they are attached afterwards.

| Phase      | Skill               | By hand                                                    |
| ---------- | ------------------- | ---------------------------------------------------------- |
| 1. Release | `cut-release`       | write `releases/<version>.md`, `npm run release <version>` |
| 2. Build   | `build`             | `npm run android:bundle` / `npm run ios:ipa`               |
| 3. Publish | `publish-artifacts` | `npm run release:publish`                                  |

`npm run release <version>` bumps every version location, regenerates the artifacts above, commits,
tags `v<version>`, and publishes the GitHub Release. Pass `--no-publish` to stop after the local
commit/tag for a dry run. (`androidVersionCode` can be omitted from the frontmatter — the script
assigns and pins it.)

`npm run release:publish` then attaches the built binaries, reading the version out of each one and
refusing any that does not match the release — the build output directories are not cleaned between
releases, so a leftover from an older version is otherwise indistinguishable by path. Add
`--dry-run` to verify without uploading, or `--only=android` / `--only=ios` when just one platform
is built.
