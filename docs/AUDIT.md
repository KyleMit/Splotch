# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

### [Docs] sharp `joinChannel` → webp silently drops the alpha plane

**File(s):** `tools/asset-gen/CLAUDE.md` (folder rules), `tools/asset-gen/lib/punch-twin.mjs` (where the gotcha is currently documented)

#### Problem

Building the punched twins, the natural sharp idiom — `sharp(rgb).joinChannel(alphaBuf,
{raw: …}).webp().toFile(…)` — **silently flattens the 4th band**: the output decodes as
`channels: 3, hasAlpha: false` with no error or warning (joinChannel tags the band as a
generic extra channel, not alpha, and the webp encoder drops it). This session's first
full 154-file batch shipped with no alpha at all; it was caught only by an explicit
post-hoc metadata check, then took an isolated repro to attribute, then a full re-encode.
The failure mode is *silent output corruption* in the folder's core library, and asset-gen
is sharp-heavy — any future transparency work (night-twin tooling, thumbnail alpha) can
reach for the same idiom. The gotcha is now documented, but only in a code comment inside
`lib/punch-twin.mjs` where the next fresh script won't see it. Cost: slow.

#### Proposed solution

Add one line to the `tools/asset-gen/CLAUDE.md` rules list: "**sharp gotcha:** never
`joinChannel` an alpha plane and encode — the band isn't tagged as alpha and webp/png
output silently flattens it. Build an explicit interleaved RGBA buffer and construct
`sharp(rgba, {raw: {…, channels: 4}})` (see `lib/punch-twin.mjs`), and verify outputs
with `sharp(out).metadata()` → `hasAlpha: true`."

#### Verification

The next session writing alpha-producing sharp code greps or reads the folder CLAUDE.md
and uses the raw-RGBA construction first — no silent 3-channel batch followed by a
re-encode in the transcript.

### [Docs] run-splotch's custom-script example isn't runnable as written

**File(s):** `.claude/skills/run-splotch/SKILL.md` (custom Playwright script example, ~lines 78–90)

#### Problem

The skill's custom-script example launches with `executablePath:
process.env.PLAYWRIGHT_CHROMIUM` plus a comment saying "copy driver.mjs's
chromiumExecutablePath() fallback" — but `PLAYWRIGHT_CHROMIUM` is unset by default, so the
example as written launches with `executablePath: undefined`, and the "copy the function"
instruction sends you to another file. This session re-derived the fallback from memory
and guessed wrong (`/opt/pw-browsers/chromium/chrome-linux/chrome` — the bare `chromium`
entry is not the versioned browser dir), failing the first launch; the fix was
`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. This is the
third session-audit row touching cloud Chromium-path friction (see AUDIT-LOG 2026-07-08,
2026-07-09) — the class keeps resurfacing because each fix points at the resolver instead
of inlining it. Cost: minor.

#### Proposed solution

Make the skill's example block self-contained: paste the actual working resolver into it
(the `readdirSync(PLAYWRIGHT_BROWSERS_PATH)` loop from `driver.mjs`, which must prefer
`chromium-<rev>/chrome-linux/chrome` over the bare `chromium` entry), or replace the
comment with the shell one-liner `PLAYWRIGHT_CHROMIUM=$(ls -d
/opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) node your-script.mjs`. Either
way the example should run verbatim in a cloud session.

#### Verification

Copy the skill's example block into a fresh script and run it unmodified in a cloud
session — Chromium launches first try, no `executable doesn't exist` retry.

### [Docs] pr-screenshots' URL sanity check is masked by the cloud proxy

**File(s):** `.claude/skills/pr-screenshots/SKILL.md` (~line 77)

#### Problem

The skill says to sanity-check a raw URL with `curl -sI <raw-url>` expecting `200` and
`content-type: image/png`. In cloud sessions all HTTPS goes through the agent proxy, so
the first response line is always `HTTP/1.1 200 Connection Established` (the CONNECT
handshake) — this session's check printed that `200` for all three URLs *regardless of
whether the object existed*, and the real status needed a second form. A future session
following the skill verbatim can read the proxy 200, post a 404 image URL into a PR body,
and never know. Cost: minor, but it converts a verification step into a false positive.

#### Proposed solution

Change the skill's check to the proxy-safe form: `curl -s -o /dev/null -w "%{http_code}
%{content_type}\n" <raw-url>` (expect `200 image/png`), with a parenthetical that `-sI |
head -1` shows the proxy CONNECT line in cloud sessions, not the origin status.

#### Verification

Grep the skill for `curl -sI` — gone, replaced by the `-w "%{http_code}"` form; running
that form against a deliberately wrong raw URL prints `404`, not `200`.
