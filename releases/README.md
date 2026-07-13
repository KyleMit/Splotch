# Release notes

Each release is one Markdown file in this folder, named for its semver version (`1.2.0.md`). **These
files are the single source of truth** for the version number and the release notes. Everything else
is generated from them:

| Target                                 | Generated artifact                                             |
| -------------------------------------- | -------------------------------------------------------------- |
| In-app About tab ("What's New")        | `src/lib/releases.json`                                        |
| Google Play "What's new"               | `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` |
| App Store "What's New in This Version" | `fastlane/metadata/en-US/release_notes.txt`                    |
| GitHub Release                         | the file body, via `gh release create`                         |
| App version                            | `package.json`, Android `build.gradle`, iOS `Info.plist`       |

## File format

```markdown
---
version: 1.2.0          # semver, must match the filename
date: 2026-06-10        # YYYY-MM-DD, the release date
androidVersionCode: 3   # monotonic integer; filled in by the release script
---

## ✨ New

* A new thing

## 🚀 Improved

* A better thing

## 🛠 Fixed

* A fixed thing
```

The body is free Markdown. Headings become section labels in the plain-text store changelogs; list
items become `•` bullets. Keep the Android changelog under **500 characters** (the script warns if
the latest release exceeds it).

## How to cut a release

Run the `/release` slash command in Claude Code (it drafts notes from the git log since the last
tag, you review, it writes the file and publishes), or do it by hand:

1. Create `releases/<version>.md` with the notes (frontmatter `androidVersionCode` can be omitted —
   the script fills it in).
2. Run `npm run release <version>`.

`npm run release <version>` bumps every version location, regenerates the artifacts above, commits,
tags `v<version>`, and publishes the GitHub Release (attaching the release `.aab` if it has been
built). Pass `--no-publish` to stop after the local commit/tag for a dry run.
