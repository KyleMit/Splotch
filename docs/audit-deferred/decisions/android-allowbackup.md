# `android:allowBackup="true"` is unexplained for a privacy-first kids app

**Original finding:** [P4][documentation] — `android/app/src/main/AndroidManifest.xml:4` — deferred
because the implementation attempt failed (sandbox environment, not substance) **Verdict:** FIX

## Context

The manifest ships the Capacitor template default `android:allowBackup="true"` with no rationale,
while every permission in the same file carries a WHY comment. `allowBackup=true` opts the app's
private data (SharedPreferences, databases, most of the data dir) into Android Auto Backup to the
user's Google account, and into device-to-device transfer. For a Families-policy kids app, whether
any stored state leaves the device should be a deliberate, documented decision.

The burndown attempt actually made the substantive change — disable backup, add a matching line to
the `mobile` skill's Families checklist — and failed only because the nested sandbox could not write
the ruler-generated `.agents/` copy after regenerating the `.claude/` copy. No reviewer objection to
the substance was recorded; the driver noted `npm run ruler:apply` must simply run outside that
sandbox. There is no draft patch to salvage.

## Current state

Verified at HEAD (63a7aa49):

* `android/app/src/main/AndroidManifest.xml:4` still has `android:allowBackup="true"`, no comment,
  no `android:fullBackupContent`, no `android:dataExtractionRules` anywhere in `android/`.
* The `mobile` skill's kids-compliance material (`.ruler/skills/mobile/native.md` §4, Families
  checklist in `.ruler/skills/mobile/android.md` §4) says nothing about backup.
* `targetSdkVersion = 36`, `minSdkVersion = 24` (`android/variables.gradle`) — so the API 31+
  `dataExtractionRules` mechanism is relevant, but `allowBackup="false"` alone still fully disables
  cloud backup and D2D transfer on every supported API level.

What the native app actually persists in its private data dir (verified in `web/src/`):

1. **Settings toggles** — `lib/storage.ts` mirrors every `STORAGE_KEYS` value from localStorage into
   Capacitor Preferences (SharedPreferences). Mostly booleans/ints (sound, theme, brush,
   orientation…).
2. **`splotch-ai-access-token`** (`lib/storageKeys.ts:14`, written via
   `settings.svelte.ts`/`writeString`) — a real API credential, sent as an auth header to the hosted
   `/api` (`lib/drawing/aiImage.ts:159`), stored in **plaintext** SharedPreferences. This is exactly
   the kind of value Auto Backup would silently ship to Google's cloud.
3. **Keystore-bound secrets** — the parent's Gemini API key and the admin session token go through
   `@aparajita/capacitor-secure-storage` (`lib/secureStorage.ts`): ciphertext encrypted with a
   non-exportable Android Keystore key. Backed-up ciphertext restored onto another device is
   **undecryptable by design** (Keystore keys never leave the device), so a restore produces dead or
   error-prone state, never a working migration of these secrets.
4. **No child-created content.** Saved drawings go to the photo gallery via MediaStore
   (FileProvider + `WRITE_EXTERNAL_STORAGE maxSdk=28` path) — outside app data, entirely unaffected
   by `allowBackup`, and already covered by the user's own photo backup (e.g. Google Photos). The
   in-progress canvas is not persisted at all, and the `splotch-fs` folder-save IndexedDB
   (`lib/drawing/folderSave.ts`) is explicitly web/desktop-only.

## Options considered

1. **`allowBackup="false"` + rationale comment + Families-checklist line** (winner). Pros: nothing
   leaves the device — the cleanest possible Data-safety/Families story ("no data collected, no data
   backed up off-device"); stops the plaintext `splotch-ai-access-token` from being uploaded to the
   Google account; avoids the broken-restore trap where Keystore ciphertexts come back undecryptable
   and WebView state comes back stale. Cons: after a device migration the parent re-enters the
   access code / API key and re-toggles a handful of settings — a one-time, parent-facing cost
   measured in seconds.
2. **Keep `true`, add a rationale comment, optionally scope with `dataExtractionRules` (API 31+)
   plus `fullBackupContent` (API ≤ 30) excluding the token/secure-storage prefs.** Pros: settings
   survive migration. Cons: the one thing worth migrating in principle — the secure-storage secrets
   — *cannot* migrate (Keystore), so the "drawings and setup survive migration" story is illusory:
   drawings already migrate via the gallery, secrets can't, and only trivial toggles remain. The
   selective-rules variant adds two XML resources and a dual-mechanism maintenance burden to protect
   a payload of booleans. Worst cost/benefit here.
3. **DROP (leave the default, undocumented).** Rejected: the finding's core claim held up and got
   *stronger* on inspection — a plaintext API credential is currently included in cloud backups of a
   kids app whose privacy policy says nothing is collected or tracked. The fix is two lines plus a
   checklist bullet.

## Decision / lean

**FIX — option 1.** In `android/app/src/main/AndroidManifest.xml`, set `android:allowBackup="false"`
with a short WHY comment matching the file's existing permission comments. Add one bullet to the
Families-policy checklist in `.ruler/skills/mobile/android.md` (§ "Families policy (kids
compliance)") recording the decision, then run `npm run ruler:apply` to regenerate the `.claude/`
and `.agents/` copies.

This is not a genuine coin-flip: the migration benefit of `true` is mostly illusory for this app
(drawings live in the gallery, secrets are Keystore-bound and non-migratable), while the costs of
`true` are concrete (credential in cloud backup, broken partial restores, muddier Families story).

`dataExtractionRules` note: it is the modern API 31+ replacement for `fullBackupContent` and the
right tool when an app wants *selective* backup. Splotch has nothing worth selectively keeping, so
plain `allowBackup="false"` — which disables backup and D2D transfer across minSdk 24 → target 36
without extra XML — is the simpler, complete answer. Revisit only if a real in-app gallery of saved
drawings ever moves into app-private storage.

## Why the previous attempt failed, and how this path avoids it

The only failure was environmental: the burndown sandbox denied writes under `.agents/`, so
`npm run ruler:apply` could not emit the generated Codex copy of the mobile skill after the
`.ruler/` source edit. No substantive reviewer objection exists to answer. Resolution: implement in
a normal (non-nested-sandbox) session; edit only the `.ruler/skills/mobile/android.md` source and
let `npm run ruler:apply` regenerate both agent trees — never hand-edit the generated copies.

## Implementation sketch

`android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Backups disabled: nothing here is worth migrating (drawings save to the
     photo gallery; secure-storage secrets are Keystore-bound and cannot
     restore onto another device) and the AI access token must not be
     copied into cloud backups. Child data never leaves the device. -->
<application
    android:allowBackup="false"
    ...
```

`.ruler/skills/mobile/android.md`, under "Families policy (kids compliance)":

```markdown
* [x] **Backups disabled** (`android:allowBackup="false"` in the manifest): no app data — settings,
      the AI access token, or secure-storage ciphertext — is copied to Google cloud backup or
      device-to-device transfer. Drawings are unaffected (they save to the photo gallery). Keep it
      `false`; if selective backup is ever wanted, use `android:dataExtractionRules` (API 31+).
```

Verification: manifest inspection plus, on a device/emulator, `adb shell bmgr backupnow art.splotch`
(or legacy `adb backup`) confirming the app is skipped/produces no data. The E2E/unit suites are
unaffected; `npm run ruler:check` must pass (proves the generated copies were regenerated).
