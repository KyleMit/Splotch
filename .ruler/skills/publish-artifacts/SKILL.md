---
name: publish-artifacts
description: Attach the built .aab/.ipa to the GitHub Release for a version, verifying each artifact's embedded version first. Use after the cut-release and build skills, or whenever a GitHub Release is missing its binaries or has the wrong ones attached.
---

You are attaching Splotch's **built store artifacts** to an existing GitHub Release. This is the
third and last phase of shipping:

| Phase      | Skill               | Produces                                                |
| ---------- | ------------------- | ------------------------------------------------------- |
| 1. Release | `cut-release`       | version bump, tag, notes, GitHub Release (no artifacts) |
| 2. Build   | `build`             | the signed `.aab` / `.ipa` for that version             |
| 3. Publish | `publish-artifacts` | those artifacts attached to the release (you are here)  |

**Why this is a separate phase.** A build can only carry a version that is already committed, so at
the moment `cut-release` creates the GitHub Release there is no correct artifact in existence — only
whatever an earlier build left behind. `release.mjs` used to attach that file, which is how v1.4.0
shipped a 1.2.0 bundle. Splitting the phases is what makes the correct artifact possible; verifying
the version is what makes the wrong one impossible (ADR-0077).

Optional argument: a version (e.g. `1.4.0`). If omitted it uses the current `package.json` version,
which is the one `cut-release` last bumped to.

## Steps

1. **Check what is on the release now.** Run
   `gh release view v<version> --json assets --jq '.assets[].name'`. Report what is already attached
   — if the expected artifacts are all there, say so and ask whether the user wants to re-upload
   (the script clobbers by design, so re-running is safe and is the right fix for a wrong asset).

2. **Verify before uploading.** Run `npm run release:publish -- --dry-run`. This reads the version
   out of each artifact's own bytes (the `.aab`'s protobuf `AndroidManifest.xml`, the `.ipa`'s
   `Info.plist`) and compares both versionName and versionCode against `releases/<version>.md`.
   Report exactly what it found before doing anything else.

3. **Handle the outcomes.** Do not work around a refusal — every one of them means the upload would
   have been wrong:

   * **A stale artifact** (version mismatch) — the build output directory still holds an older
     version's file. Tell the user which artifact and which version, and that the fix is to run
     `build` for this version. Never delete the stale file and upload the other one silently, and
     never pass a flag to skip the check.
   * **Nothing built** — no artifacts on disk at all. Point at `build`.
   * **Only one platform built** — normal (iOS needs macOS + Xcode). Use `--only=android` /
     `--only=ios` to publish just the one that is ready, and say which platform is still missing so
     it is a deliberate choice rather than an oversight.
   * **No GitHub Release for the version** — `cut-release` has not run, or ran with `--no-publish`.
     Point at `cut-release`; do not create the release here.

4. **Upload.** Once the dry run is clean, run `npm run release:publish` (adding `--only=…` if only
   one platform is ready). It refuses on mismatch and uploads with `--clobber`.

5. **Report** the release URL, which artifacts were attached with the version each carries, and any
   platform deliberately skipped. Remind the user that attaching to the GitHub Release is **not**
   the store submission — uploading to the Play Console and Transporter is still manual, with the
   "What's new" text at `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` and
   `fastlane/metadata/en-US/release_notes.txt`.
