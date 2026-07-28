# `bumpAndroidGradle` / `bumpIosPbxproj` regexes are unanchored and global

**Original finding:** [P2][cross-platform] — `scripts/lib/native-version.mjs:28-53` — deferred
because it failed adversarial review three times. **Verdict:** FIX

## Context

The native version bumpers (used by `scripts/release.mjs` via `setAndroidVersion` / `setIosVersion`)
rewrite the Android and iOS project files with bare, greedy, global regexes:

```js
.replace(/versionName.*/g, `versionName "${version}"`)
.replace(/versionCode.*/g, `versionCode ${versionCode}`);
```

`versionName.*` also matches inside a hypothetical `versionNameSuffix ".debug"` line (and any
comment mentioning `versionName`), and `/g` rewrites every match — silent corruption, no error. Same
hazard for `versionCode` vs `versionCodeOverride` and the iOS keys. The guard checks only assert
*presence*, never uniqueness, so nothing detects the file drifting out of the single-occurrence
shape the comment assumes. Because a Groovy `versionName` call can legally appear twice (the second
silently wins), the corruption would not even fail the Gradle build — a wrong version could ship.

The burndown implementer tried to fix this three times and the reviewer escalated the required
robustness each round:

1. Anchored patterns reject/skip assignments followed by an **inline comment** instead of updating
   them while preserving the comment.
2. Anchored patterns still match assignment-shaped text inside `/* ... */` **block comments** —
   Android reports a false duplicate, iOS rewrites commented text.
3. Whole-line anchoring silently skips **compact pbxproj dictionaries** like
   `buildSettings = { MARKETING_VERSION = 1.2.3; ... };`.
4. The masking helper added in response treats `/*` inside a `//` comment as a block-comment start.
5. The masking is not **string-aware**: `/*` inside a Gradle string literal masks real assignments;
   assignment-shaped text inside a quoted pbxproj value gets rewritten.

By round 3 the draft (kept at
`docs/audit-deferred/p2-cross-platform-bumpandroidgradle-bumpiospbxproj-regexes-are-unanchore.patch`)
had grown a character-by-character comment-masking scanner, reverse-ordered index-based splicing,
and a 114-line test zoo — and the reviewer was still demanding string-literal lexing. That is the
trajectory of writing a Gradle/pbxproj parser, which a two-file repo-internal bump script does not
warrant.

## Current state

Verified at HEAD (63a7aa49):

* `scripts/lib/native-version.mjs` is unchanged from the finding — bare `/versionName.*/g` etc.,
  presence-only guards. The problem is real but **latent**.
* `android/app/build.gradle` contains exactly one `versionCode 5` (line 28) and one
  `versionName "1.3.0"` (line 29). No `versionNameSuffix`, no `versionCodeOverride`, no comment
  mentions either token anywhere in the file.
* `ios/App/App.xcodeproj/project.pbxproj` contains exactly two `CURRENT_PROJECT_VERSION = 5;` and
  two `MARKETING_VERSION = 1.3.0;` lines (Debug + Release), each a plain tab-indented
  one-assignment-per-line entry as Xcode always writes build settings. No compact
  `buildSettings = { ... };` one-liners, no commented-out assignments — Xcode does not emit either
  for build settings.
* No test file covers this module (`scripts/tests/` has no `native-version.test.mjs`).

So today's behavior on today's files is correct. The finding's value is insurance: a routine future
Gradle edit (adding a debug `versionNameSuffix` is genuinely common) would flip silent-correct into
silent-corrupt.

## Options considered

**(a) Line-based matching + fail-closed occurrence guard — chosen.** Split into lines; a strict
whole-line pattern identifies each assignment; rewrite only matching lines, preserving indentation.
Then the guard: every line merely *containing* the token must be one of the strictly-matched lines —
otherwise throw. Android additionally requires exactly one match per token; iOS requires at least
one (rewriting all build configurations, as today). ~30 lines, no parser, byte-identical output on
the real files.

* Pro: silent corruption becomes structurally impossible — anything the script doesn't fully
  understand (a suffix line, a comment mentioning the token, a compact dictionary, a string
  containing the token) trips the guard and fails **loudly** with an instruction to update the file
  or the script. Fail-closed beats parse-everything for a script a human runs interactively at
  release time.
* Con: legitimate-but-unrecognized future shapes (e.g. an inline comment on the version line) stop
  the release until someone adjusts one regex or the file. That is the accepted tradeoff — a
  one-minute loud fix vs. a silently wrong shipped version.

**(b) The draft's masking parser — rejected.** Handles more shapes, but each parser layer spawned
the next objection (comments-in-strings, strings-in-comments) and it still isn't a real lexer. It is
~110 lines of subtle scanner code plus splice arithmetic to protect two committed files that contain
none of those shapes. Three failed rounds are the empirical evidence this path doesn't converge.

**(c) Minimal anchoring only (the finding's original proposal), no occurrence guard.** Smaller
still, but a compact pbxproj dict or odd line would be silently *skipped* rather than flagged — the
reviewer's objection 3 is actually right that silent skip is bad; (a) answers it with a loud failure
instead of a parser.

**(d) DROP.** Defensible — the files at HEAD are safe and the release diff is committed where a
human can see it. Rejected because the failure mode is *silent* and version-corrupting, the files
are expected to be edited (Gradle churn is routine), and option (a) costs ~30 lines plus a small
test. Cheap insurance on a release-critical path clears the bar.

## Decision / lean

**FIX with option (a).** Replace both bumpers in `scripts/lib/native-version.mjs` with a shared
line-based helper; add a focused `scripts/tests/native-version.test.mjs` (runs under
`npm run test:scripts`). Update the module header comment — the "byte-identical to
capacitor-set-version" claim goes away; output on the real files is still byte-identical, which the
test proves by running the transform against the actual committed project files.

Patterns:

* Android: `/^(\s*)versionName\s+"[^"]*"\s*$/` → `` `$1versionName "${version}"` ``, exactly 1
  required; `/^(\s*)versionCode\s+\d+\s*$/` → `` `$1versionCode ${versionCode}` ``, exactly 1
  required. Guard token: `versionName` / `versionCode` (note `versionNameSuffix` *contains*
  `versionName`, so a suffix line trips the guard by construction).
* iOS: `/^(\s*)MARKETING_VERSION = [^;]+;\s*$/` and `/^(\s*)CURRENT_PROJECT_VERSION = \d+;\s*$/`, ≥1
  required, all matches rewritten (Debug + Release). Guard tokens: the two key names.

Error messages must say which token, which file, and that the fix is either normalizing the file
line or updating `scripts/lib/native-version.mjs`.

Tests (small, not the draft's zoo): bumps the real committed `build.gradle` / `project.pbxproj`
contents correctly (read the actual files — this also locks script/file agreement); preserves
indentation; `versionNameSuffix` present → throws; comment line mentioning `versionCode` → throws;
duplicate `versionName` → throws; missing key → throws; iOS rewrites both configurations; iOS
compact `buildSettings = { MARKETING_VERSION = ...; };` line → throws (not silently skipped).

## Why the previous attempt failed, and how this path avoids it

The review failed because the implementer accepted the premise that every objection required more
*parsing*. This path re-frames the contract: the script bumps the two shapes Xcode and this repo's
Gradle file actually use, and **refuses loudly** on anything else. Objection by objection:

1. *Inline comments on assignment lines are rejected instead of preserved.* **Accepted behavior,
   argued in scope-limited form:** neither committed file has an inline comment on a version line;
   if one is ever added, the script fails with a clear message instead of guessing. Preserving
   comments verbatim requires comment parsing — the exact escalation ramp that sank three drafts.
   Fail-loud is the documented contract, covered by a test asserting the throw.
2. *Anchored patterns match assignment-shaped text inside block comments.* For Android, the guard
   turns this into a loud duplicate/unrecognized-line error — which is the correct fail-closed
   outcome, not a false positive to be parsed around. For iOS, out of scope: pbxproj is
   machine-generated and Xcode never writes commented-out assignments on their own lines; its only
   comments are same-line `/* name */` annotations in file/reference sections, which contain no
   version keys.
3. *Compact pbxproj dictionaries are silently skipped.* Resolved without a parser: a line containing
   `MARKETING_VERSION` that doesn't match the strict pattern trips the occurrence guard and throws.
   Silent skip — the legitimate core of this objection — is eliminated; covered by a test.
4. *`/*` inside a `//` comment breaks the block-comment masker.* Resolved by deletion: there is no
   masker.
5. *Not string-aware.* Same: no masking to poison. A Gradle string containing `versionName` would
   trip the guard and fail loudly — acceptable for files this repo controls, and infinitely better
   than today's silent rewrite of that string.

Any future reviewer demand to *update* rather than *reject* exotic shapes should be ruled out of
scope by pointing at this doc: the contract is fail-closed, and the two files it guards are
committed in this repo and reviewed at release time.

## Implementation sketch

```js
function bumpLine(lines, { token, pattern, render, exactlyOne, path }) {
  const matched = new Set();
  const out = lines.map((line, i) => {
    const m = line.match(pattern);
    if (!m) return line;
    matched.add(i);
    return render(m[1]);
  });
  if (matched.size === 0) {
    throw new Error(`Could not find "${token}" in ${path}`);
  }
  if (exactlyOne && matched.size > 1) {
    throw new Error(`Expected exactly one "${token}" in ${path}, found ${matched.size}`);
  }
  lines.forEach((line, i) => {
    if (line.includes(token) && !matched.has(i)) {
      throw new Error(
        `Unrecognized line mentioning "${token}" in ${path}: ${line.trim()} — `
          + `normalize the line or update scripts/lib/native-version.mjs`,
      );
    }
  });
  return out;
}

export function bumpAndroidGradle(source, version, versionCode) {
  let lines = source.split('\n');
  lines = bumpLine(lines, {
    token: 'versionName',
    pattern: /^(\s*)versionName\s+"[^"]*"\s*$/,
    render: (indent) => `${indent}versionName "${version}"`,
    exactlyOne: true,
    path: ANDROID_GRADLE_PATH,
  });
  lines = bumpLine(lines, {
    token: 'versionCode',
    pattern: /^(\s*)versionCode\s+\d+\s*$/,
    render: (indent) => `${indent}versionCode ${versionCode}`,
    exactlyOne: true,
    path: ANDROID_GRADLE_PATH,
  });
  return lines.join('\n');
}
// bumpIosPbxproj: same helper, exactlyOne: false, patterns
// /^(\s*)MARKETING_VERSION = [^;]+;\s*$/ and /^(\s*)CURRENT_PROJECT_VERSION = \d+;\s*$/
```

(Note: `versionCodeOverride` does not contain the token `versionCode` followed by whitespace, but it
*does* contain the substring `versionCode`, so the guard flags it — intended.)
