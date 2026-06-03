---
description: Draft release notes from the git log, then bump versions and publish a release
---

You are cutting a new release of Splotch. The committed `releases/<version>.md`
file is the single source of truth; everything else (in-app About tab, store
changelogs, GitHub release, version numbers) is generated from it by
`scripts/release.mjs` and `scripts/generate-releases.mjs`. Read
`releases/README.md` if you need the format.

Optional argument: a target version (e.g. `/release 1.2.0`). If omitted, you
will propose one.

Follow these steps:

1. **Gather commits since the last release.**
   - Find the last tag: `git describe --tags --abbrev=0` (if it fails, there are
     no tags yet — use the full history).
   - List the commits: `git log <last-tag>..HEAD --pretty=format:"%h %s"` (or all
     commits if no tag).
   - If there are zero new commits, tell the user and stop.

2. **Propose the version number.** Look at the current version in
   `package.json` and the nature of the commits, then suggest a semver bump
   (patch for fixes only, minor for new user-facing features, major for breaking
   changes). If the user passed a version as the argument, use that instead.

3. **Draft the release notes.** Write Markdown grouped under the headings the
   project uses — `## ✨ New`, `## 🚀 Improved`, `## 🛠 Fixed` (omit empty
   sections). Translate commit subjects into concise, **user-facing** language —
   describe what changed for someone using the app, not the implementation.
   Drop purely internal commits (tooling, refactors, test-only, CI) unless they
   affect users. Keep it tight: the plain-text version feeds the Google Play
   "What's new" box, which has a **500-character limit**.

4. **Review with the user.** Show the proposed version and the drafted notes.
   Ask them to approve or edit. Iterate until they are happy. Do not proceed
   without explicit approval.

5. **Write the release file.** Create `releases/<version>.md` with frontmatter:
   ```
   ---
   version: <version>
   date: <today's date as YYYY-MM-DD>
   ---
   <approved notes>
   ```
   Get today's date from the environment (the date is in your context, or run
   `git log -1 --format=%cd --date=short`). Omit `androidVersionCode` — the
   script assigns and pins it.

6. **Confirm the publish step**, then run it. Publishing pushes to `main`,
   creates the `v<version>` tag, and opens a public GitHub Release. Ask the user
   which they want:
   - Full publish (default): `npm run release <version>`
   - Local only (commit + tag, no push/GitHub): `npm run release <version> -- --no-publish`
   - Dry run (regenerate files only, no git): `npm run release <version> -- --dry-run`

7. **Report the result** — the new version, the versionCode that was assigned,
   and the GitHub release URL if published. Remind the user that the Play /
   App Store "What's new" text is ready to paste from
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` and
   `fastlane/metadata/en-US/release_notes.txt`. If they want the `.aab`
   attached to the GitHub release, it must be built first with
   `npm run android:bundle` before running the release.
