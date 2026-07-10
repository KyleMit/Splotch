# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

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
