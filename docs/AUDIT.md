# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Session audit

### [Docs] Targeted single-file Vitest run is undocumented — Unit section diverges from E2E

#### Problem

`slow` (high recurrence). Iterating on one unit test has no documented invocation, so the first
reach fails. Wanting to run only `web/src/lib/server/securityHeaders.test.ts`, I tried
`node scripts/web.mjs test:unit -- <file>` → `test:unit: not found` (`web.mjs` dispatches to a
*binary*, not npm-script names), then had to `grep package.json` to learn `test:unit` =
`node scripts/web.mjs vitest run`, then ran `node scripts/web.mjs vitest run <file>`. The testing
skill's **E2E** section (`.claude/skills/testing/SKILL.md`, ~L87–96) documents the single-spec form
(`npm run test:e2e -- flows.spec.ts -g "…"`) and even warns against raw `npx`, but the **Unit**
section (~L53–56) lists only `npm run test:unit` / `test:unit:watch` — no single-file form. A
sibling section already carries the convention; the Unit section is the divergence. Targeted unit
runs are a core TDD loop, so every session iterating on a `*.test.ts` re-derives this.

#### Proposed solution

In `.ruler/skills/testing/SKILL.md` (the source — the `.claude/`/`.agents/` copies are generated;
run `npm run ruler:apply` after, ADR-0058), add a single-file line to the Unit section mirroring the
E2E one:

```
# one file / one test name (trailing args pass through to `vitest run`):
npm run test:unit -- src/lib/server/securityHeaders.test.ts
npm run test:unit -- -t "mirrors the netlify.toml"   # by test name — vitest uses -t, not Playwright's -g
```

Verified: `npm run test:unit -- <file>` runs only that file. Call out the `-t` vs `-g` difference so
the two sections aren't conflated.

#### Verification

A future session running one unit file finds `npm run test:unit -- <path>` in the testing skill's
Unit section — no failed `node scripts/web.mjs test:unit` guess and no `package.json` grep to
recover the invocation.
