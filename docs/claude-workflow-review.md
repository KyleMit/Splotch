# Claude Code Workflow Review — Splotch

**Date:** 2026-06-13
**Goal:** An integrated, token-efficient development system tuned to how you actually work.
**Your two priorities (confirmed):** stop burning tokens, and stop the repetitive permission prompts.

---

## TL;DR

Your project-level setup (CLAUDE.md, skills, rules, slash commands, ADR discipline) is genuinely
**best-in-class** — better than most of the public "power user" setups. The problems are not in
*what knowledge you've encoded*; they're in *runtime mechanics*:

1. **~55% of your Bash calls are read-only shell** (`grep`/`ls`/`cat`/`find`) that the dedicated
   Grep/Glob/Read tools do for a fraction of the tokens. This is your single biggest token leak.
2. **Everything runs on Opus**, including throwaway file-search work that Haiku does fine.
3. **`settings.local.json` had ~50 entries**, most of them dead one-offs (specific
   curl-with-token commands, `kill %1`) that will never match again — so you kept re-approving
   similar commands.
4. **No subagents** — so exploration and review happen in your main context, bloating it and
   degrading quality on long sessions (several of yours exceeded 1 MB).

The three changes you approved — **broad allowlist**, **prune + consolidate permissions**,
**tier models** — address all four. They're applied; details below.

---

## What I looked at

- **User config:** `~/.claude/settings.json` (model, hooks, theme).
- **Project config:** `.claude/settings.json`, `.claude/settings.local.json`, `.claude/rules/*`,
  `.claude/skills/*`, `.claude/commands/*`, the nested `CLAUDE.md` files.
- **Session history:** 40 sessions (~11 MB) under
  `~/.claude/projects/-Users-kylemit-Code-Splotch/`, aggregated for tool-usage and friction.
- **Benchmark:** current public best-practice writeups (sources at the bottom).

---

## Findings from your session history

**Tool usage (all sessions):**

| Tool | Calls | Note |
| --- | --- | --- |
| Bash | 306 | …but see the breakdown below |
| Read | 278 | healthy |
| Edit | 225 | healthy |
| Write | 62 | |
| TodoWrite | 17 | |
| Skill | 10 | your custom commands are getting used |
| ToolSearch | 5 | |
| AskUserQuestion | 2 | |

**Bash command breakdown (the leak):**

| First word | Calls | Should be |
| --- | --- | --- |
| `grep` | 88 | **Grep tool** |
| `ls` | 45 | **Glob tool** / Read |
| `cat` | 25 | **Read tool** |
| `find` | 17 | **Glob tool** |
| `head` | 7 | **Read tool** (with offset/limit) |
| npm / npx | 62 | legitimately Bash |
| git | 11 | legitimately Bash |
| curl | 11 | mostly ad-hoc API tests — see below |

**~182 of 306 Bash calls (≈60%) were read-only file inspection.** Each one ships a full shell
command + raw stdout into context, where the dedicated tools return structured, paginated,
cache-friendly output. This is the highest-ROI behavior change available.

**Other signals:**

- The **`/fix-next-todo` TODO.md loop is your dominant workflow** (implement first item → run
  checks → suggest commit message → *you* commit). The manual commit gate is intentional and
  preserved.
- **Friction was low on rejections** (one genuine tool rejection across all sessions) — your pain
  is *volume of approvals*, not wrong approvals. That's exactly what a broader allowlist fixes.
- **Context bloat is real:** several sessions exceeded 1 MB; one hit 1.4 MB. Long single-thread
  sessions are where Opus quality and cost both degrade.

---

## What you're doing right (don't change)

- **Layered knowledge:** root + nested `CLAUDE.md`, path-scoped `.claude/rules/`, on-demand
  skills, and ADRs. This is the textbook structure and you're ahead of most setups.
- **Skills with clear "read before…" triggers** — exactly how skills are meant to be scoped.
- **Sound hooks** (`PermissionRequest`/`Notification` → Glass, `Stop` → Ping) for
  away-from-keyboard awareness.
- **ADR discipline + `scripts-info` naming convention** — institutional memory done well.

---

## Benchmark vs. best-in-class (2026)

The recommended modern stack is five layers: **CLAUDE.md · rules/skills · hooks · subagents · MCP**.
You have the first three at a high level. The gap is the last two:

| Layer | Best practice | You today | Action |
| --- | --- | --- | --- |
| CLAUDE.md / rules | scoped, layered | ✅ strong | — |
| Skills / commands | reusable, triggered | ✅ strong | — |
| Hooks | safety + automation | ⚠️ notifications only | optional: add an auto-formatter hook |
| **Subagents** | read-only, model-tiered, for search/review | ❌ none | **added an `explorer` (Haiku) agent** |
| **MCP** | only what you use | ❌ none | skip for now (you said tokens/permissions first) |

The consensus token-saving moves are: **`/clear` between tasks** (cuts per-message cost 30–50% by
shedding stale context), **read-only subagents on cheaper models** for exploration (40–50% cheaper
on the grunt half of a session), and **prefer structured tools over raw shell**. All three map
directly onto your findings.

---

## Recommendations (prioritized)

### Tier 1 — Token efficiency (your #1 priority)

1. **Prefer Grep/Glob/Read over shell.** *(Behavioral — encoded in CLAUDE.md below.)*
   This alone targets ~60% of your Bash volume. Reserve Bash for things that actually run
   (npm/npx/git/node scripts).
2. **Tier models — APPLIED.** Main session stays Opus for implementation. A new committed
   `explorer` subagent (`.claude/agents/explorer.md`) is pinned to **Haiku** and is read-only —
   delegate "find me all the places that…" fan-out searches to it so the cheap model does the
   reading and only the *conclusion* returns to your expensive main context.
3. **`/clear` between unrelated tasks.** Your 1 MB+ sessions are carrying dead context. When you
   switch from, say, an Android fix to an API change, `/clear` first. (Optional: `/compact` when
   you want to keep a thread but trim it.)
4. **Move ad-hoc `curl` API testing into an npm script.** You repeatedly hand-wrote
   `curl … /api/admin/...` with tokens. A `test:api:smoke` script (already covered by the
   `npm run *` allowlist) would be reusable, never prompt, and not leak tokens into the transcript.

### Tier 2 — Permission friction (your #2 priority)

5. **Broad allowlist — APPLIED** to committed `.claude/settings.json`. Read-only tool families
   (`grep`/`ls`/`cat`/`find`/`head`/`tail`/`wc`/`echo`/`sed`), `npm`/`npx`, `node scripts/*`,
   read-only `git` verbs, and the mobile toolchain (`adb`, `xcrun simctl`, `xcodebuild`) are now
   trusted wholesale.
6. **Pruned + consolidated — APPLIED.** Dead one-offs removed; machine-specific paths (Android
   SDK, `~/.claude`, `/tmp`) moved to `settings.local.json`; reusable rules promoted to the
   committed file.
7. **Deliberately *still prompts* for:** anything mutating outside the repo, `rm`, network calls
   to non-localhost, and **`git commit`/`git push`** — preserving your manual review gate.

### Tier 3 — Optional, when you want them

8. **Auto-format hook** (`PostToolUse` on Edit/Write → `npm run format` or `prettier --write`)
   so formatting never costs you a round-trip.
9. **A `reviewer` subagent on Sonnet** for diff review before you commit — cheaper than Opus,
   isolated from main context.
10. **MCP (GitHub/Netlify/Playwright)** — deferred. Real value, but it's autonomy/integration
    work, not token/permission work, so it's out of scope for this pass.

---

## What I changed in this session

- **`.claude/settings.json`** — rewritten as a broad, committed allowlist (see Tier 2).
- **`.claude/settings.local.json`** — pruned to machine-specific entries only.
- **`.claude/agents/explorer.md`** — new read-only, Haiku-pinned exploration subagent.
- **`CLAUDE.md`** — added a short "Token efficiency" note encoding the prefer-structured-tools and
  delegate-to-explorer behaviors.

All config changes are reversible via git (`git diff .claude CLAUDE.md`).

---

## Sources

- [Claude Code Advanced Best Practices (2026) — SmartScope](https://smartscope.blog/en/generative-ai/claude/claude-code-best-practices-advanced-2026/)
- [Hooks, Subagents & Skills Complete Guide — ofox.ai](https://ofox.ai/blog/claude-code-hooks-subagents-skills-complete-guide-2026/)
- [My Claude Code Setup: MCP, Hooks, Skills, Agents (2026) — okhlopkov.com](https://okhlopkov.com/claude-code-setup-mcp-hooks-skills-2026/)
- [Claude Code Features and Settings Reference 2026 — hidekazu-konishi.com](https://hidekazu-konishi.com/entry/claude_code_features_settings_reference_2026.html)
- [Claude Code Agent Teams, Subagents, and MCP — Developers Digest](https://www.developersdigest.tech/blog/claude-code-agent-teams-subagents-2026)
- [Customization Guide: CLAUDE.md, Skills, Subagents — alexop.dev](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)
