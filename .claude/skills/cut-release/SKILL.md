---
name: cut-release
description: Draft and review release notes, then bump versions, commit, tag, push, and create the GitHub Release
---

You are cutting a new release of Splotch. The committed `releases/<version>.md` file is the single
source of truth; everything else (in-app About tab, store changelogs, GitHub release, version
numbers) is generated from it by `tools/release/cut-release.mjs` and
`tools/release/gen-release-notes.mjs`. Read `releases/README.md` if you need the format.

Optional argument: a target version (e.g. `1.2.0`). If omitted, you will propose one.

Follow these steps:

1. **Gather commits since the last release.**
   * Find the last tag: `git describe --tags --abbrev=0` (if it fails, there are no tags yet — use
     the full history).
   * List the commits: `git log <last-tag>..HEAD --pretty=format:"%h %s"` (or all commits if no
     tag).
   * If there are zero new commits, tell the user and stop.

2. **Propose the version number.** Look at the current version in `package.json` and the nature of
   the commits, then suggest a semver bump (patch for fixes only, minor for new user-facing
   features, major for breaking changes). If the user passed a version as the argument, use that
   instead.

3. **Draft the release notes.** Write Markdown grouped under the headings the project uses — `## ✨
   New`, `## 🚀 Improved`, `## 🛠 Fixed` (omit empty sections). Translate commit subjects into
   concise, **user-facing** language — describe what changed for someone using the app, not the
   implementation. Drop purely internal commits (tooling, refactors, test-only, CI) unless they
   affect users. Keep it tight: the plain-text version feeds the Google Play "What's new" box, which
   has a **500-character limit**.

4. **Review with the user.** Show the proposed version and the drafted notes. Ask them to approve or
   edit. Iterate until they are happy. Do not proceed without explicit approval.

5. **Write the release file.** Create `releases/<version>.md` with frontmatter:
   ```
   ---
   version: <version>
   date: <today's date as YYYY-MM-DD>
   ---
   <approved notes>
   ```
   Get today's date from the environment (the date is in your context, or run `git log -1
   --format=%cd --date=short`). Omit `androidVersionCode` — the script assigns and pins it.

6. **Confirm the publish step**, then run it. Publishing pushes to `main`, creates the `v<version>`
   tag, and opens a public GitHub Release. Ask the user which they want:
   * Full publish (default): `npm run release <version>`
   * Local only (commit + tag, no push/GitHub): `npm run release <version> -- --no-publish`
   * Dry run (regenerate files only, no git): `npm run release <version> -- --dry-run`

7. **Report the result** — the new version, the versionCode that was assigned, and the GitHub
   release URL if published. Remind the user that the Play / App Store "What's new" text is ready to
   paste from `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` and
   `fastlane/metadata/en-US/release_notes.txt`.

   **The GitHub Release is created with no artifacts attached, and that is correct.** Do not try to
   build or attach an `.aab`/`.ipa` before or during this step, and do not tell the user they should
   have. The version this release just bumped to has to be committed *before* an artifact carrying
   it can be built, so any bundle sitting in the build output directory right now is necessarily
   from an **older** version. Attaching it is how v1.4.0 shipped a 1.2.0 bundle (ADR-0077).

8. **Point to the next steps** — releasing is the first of three phases:

   | Phase             | Skill               | Produces                                       |
   | ----------------- | ------------------- | ---------------------------------------------- |
   | 1. Release (done) | `cut-release`       | version bump, tag, notes, empty GitHub Release |
   | 2. Build          | `build`             | the signed `.aab` / `.ipa` for that version    |
   | 3. Publish        | `publish-artifacts` | those artifacts attached to the release        |

   Tell the user to run **`build`** next, then **`publish-artifacts`**. The publish step verifies
   each artifact's embedded version against the release and refuses a mismatch, so the stale-upload
   failure cannot recur silently.
