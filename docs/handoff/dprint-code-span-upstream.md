# Handoff — dprint code span upstream report

> 2026-09-04 · branch `claude/dependabot-version-pinning-398gx1` · PR
> [#1647](https://github.com/KyleMit/Splotch/pull/1647) · File the upstream bug in
> dprint/dprint-plugin-markdown that unblocks issue #1634

## Objective & non-goals

**Objective:** get an upstream report filed against `dprint/dprint-plugin-markdown` asking that
inline code spans not be broken at their internal spaces (or that the behavior be gated behind a
config option). Issue [#1634](https://github.com/KyleMit/Splotch/issues/1634) holds
`@dprint/markdown` at 0.22 until such an option exists, and its done-when says "watch upstream
releases" — but **nothing is filed upstream, so there is nothing to watch.** This handoff exists to
convert a passive wait into a filed request.

**Non-goals:**

* Do **not** bump `@dprint/markdown` or reformat the repo. That is #1634's own done-when (bump +
  reformat + `ruler:apply` land together), gated on an upstream option that does not exist yet.
* Do **not** relax `textWrap: "always"` in `dprint.json` to dodge this. ADR-0057 owns that setting.
* Do **not** touch the Dependabot ignore rule again — PR #1647 already narrowed it.

## State

Branch is pushed. PR #1647 is open against `main` and is **independent of this handoff** — it needs
no upstream outcome to merge.

| sha            | what                                                   |
| -------------- | ------------------------------------------------------ |
| `bda375c5b295` | Narrow the `@dprint/markdown` ignore rule to `>= 0.23` |

Files touched: `.github/dependabot.yml` (one line added).

The reproduction below was built in the session scratchpad, which is **ephemeral** — it is not
committed and will not survive. The recipe is self-contained; re-run it rather than hunting for the
files.

## Decisions made (and why)

* **The ignore rule got a version bound, not a bare name.** A bare `dependency-name` ignores every
  update for the package, and ignore conditions apply to Dependabot security updates as well as
  version updates — a 0.22.x patch or security fix would have been suppressed. The bound
  `versions: ['>= 0.23']` restricts it to the line actually under hold. Shipped in PR #1647.
* **`0.24+` deliberately stays ignored.** The eventual bump is not a Dependabot-shaped change: it
  must land together with the repo-wide reformat and `ruler:apply`. The rule comes out by hand with
  #1634.
* **Rejected: `textWrap: "maintainAndWrap"` as a workaround.** 0.23.0 added it, but it still wraps
  to `lineWidth`, so straddling code spans still break. It changes which lines get rewrapped, not
  whether spans are atomic.
* **Rejected: filing this as a Splotch issue.** The defect is upstream; #1634 already tracks the
  local hold. A second local issue would duplicate it.

## Unverified assumptions

* **The upstream maintainer will treat this as a bug rather than working-as-intended.** PR
  [#130](https://github.com/dprint/dprint-plugin-markdown/pull/130) added the wrapping deliberately,
  to close feature request #129 which asked for exactly this. The report has to argue that breaking
  at *internal spaces of a code span* overshoots what #129 asked for — not that wrapping inside code
  is wrong per se. This framing is untested.
* **The "670 code spans across 239 files" figure** is carried over from #1634 (measured against the
  retracted PR #1629). It was **not** re-measured this session and predates 0.23.1–0.23.3. Re-derive
  it before quoting it upstream — see next steps.
* **No upstream issue exists.** Checked by reading the open-issue list (4 open: #242 tabs, #178
  mkdocs, #162 frontmatter, #93 MDX) — none matched. A closed-issue search was attempted through a
  rendered GitHub search page and is **not** trustworthy; redo it properly before filing to avoid a
  duplicate.
* **GitHub access is scoped to `KyleMit/Splotch` in these sessions.** Filing against a third-party
  repo will likely need the browser or a differently-scoped session. Not attempted.

## Done & verified

Reproduced against the **latest** 0.23.3 (not just 0.23.0), using dprint CLI 0.57 with this repo's
exact markdown config (`lineWidth: 100`, `textWrap: "always"`). Three behaviors, all confirmed by
running them:

1. **A code span that fits on its line is untouched.** Identical output on 0.22.1 and 0.23.3.
2. **A code span with no internal spaces is never broken** — it moves to the next line whole, same
   as 0.22. Verified with an 80-char slash-delimited path at three straddle offsets.
3. **A code span *with* internal spaces that straddles the wrap column is broken at an internal
   space.** This is the whole defect.

```
0.22.1:  Prefix xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
         `gh api repos/OWNER/REPO/issues/123/sub_issues --jq '.[].number'` trailing words here.

0.23.3:  Prefix xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx `gh api repos/OWNER/REPO/issues/123/sub_issues --jq
         '.[].number'` trailing words here.
```

4. **The wrapped output is idempotent** — reformatting the broken result is stable. So this is not a
   formatting-loop bug; it is steady-state damage, which strengthens the report (no crash to hide
   behind) and weakens any "it'll settle" reply.
5. **The damage does not self-heal on downgrade.** Feeding 0.22.1 a file whose span is *already*
   broken across two lines leaves it broken — even when the whole span would fit on one line. A
   newline inside a code span is part of the span's literal content, so no version rejoins it.

Point 5 was found by accident and is the most consequential result here: **going back to 0.22 does
not repair anything 0.23 has already reformatted.** If the hold ever lapses — the ignore rule
removed, a lockfile resolved past the pin, a contributor formatting with a newer plugin — the 670
spans do not come back by reverting the version. They need a scripted repair or hand fixing. That
makes the ignore rule load-bearing rather than merely tidy, and it is worth stating on #1634, whose
current text implies the hold is a convenience.

(How it surfaced: I hand-wrapped a line of this very handoff at 100 columns and split a code span
myself; dprint 0.22.1 then preserved the break rather than healing it. Verified deliberately
afterward with a clean two-line input. A human or agent authoring Markdown by hand can introduce
exactly the defect the drift-guard tests exist to catch — an independent argument for the `rg -U`
sweep in step 2 becoming a permanent check.)

Also verified: `dprint.json` has no code-span option to reach for, and neither does upstream. On
current `main`, `src/configuration/types.rs` exposes only `pub text_wrap: TextWrap`, and
`deployment/schema.json` has only the `textWrap` ref — no `code_span`, no unbreakable setting.

Version timeline from the npm registry (`registry.npmjs.org/@dprint/markdown`), which corrects a
misread I made earlier from the rendered releases page:

| version | published  |
| ------- | ---------- |
| 0.22.1  | 2026-05-22 |
| 0.23.0  | 2026-08-26 |
| 0.23.3  | 2026-09-03 |

The 0.23 line is under active maintenance — four releases in nine days — so a well-argued report has
a realistic chance of being picked up.

On PR #1647: `npm run format:check` passes, and the YAML parses with both ignore rules intact.

### Reproduction recipe (self-contained, ~2 min)

```bash
D=$(mktemp -d) && cd "$D"
curl -sL -o p23.wasm https://plugins.dprint.dev/dprint/markdown-0.23.3.wasm
curl -sL -o p22.wasm https://plugins.dprint.dev/dprint/markdown-0.22.1.wasm
python3 -c "
span = chr(96)+\"gh api repos/OWNER/REPO/issues/123/sub_issues --jq '.[].number'\"+chr(96)
open('sample.md','w').write('# R\n\n' + '\n\n'.join('Prefix '+'x'*p+' '+span+' trailing words here.' for p in (30,48,66)) + '\n')
"
for v in 22 23; do
  cp sample.md out$v.md
  printf '{"lineWidth":100,"markdown":{"textWrap":"always"},"includes":["out%s.md"],"plugins":["%s/p%s.wasm"]}' $v "$D" $v > c$v.json
  npx --yes dprint@0.57 fmt --config "$D/c$v.json" >/dev/null 2>&1
done
diff out22.md out23.md
```

## Risks & next 3 steps

**Risk:** the report gets closed as working-as-intended, since #129 asked for this and #130
delivered it. Mitigation is in the framing — lead with the *internal-space* distinction (behavior 2
proves the plugin already treats space-free spans as atomic, so extending that to all spans is a
narrowing of existing behavior, not a new feature), and with the grep-ability argument: a code span
is a copyable contract, and a break at an internal space is exactly where a shell command loses its
meaning.

**Risk:** filing a duplicate. The closed-issue search this session was unreliable.

1. **Re-check upstream for an existing report**, properly this time — the rendered search page
   misled me once. Query closed and open issues for code span + wrap + `textWrap`. Note #222 ("Code
   span wrapped inside a list item is not idempotent", closed) is *adjacent but different*: it
   treats span wrapping as intended and fixes an idempotency bug within it. Cite it as evidence the
   maintainer already patches this area, not as a duplicate.
2. **Re-derive the impact number** against 0.23.3 rather than quoting #1634's stale 670/239. Format
   a scratch copy of the repo with the 0.23.3 wasm and count spans containing a newline —
   `rg -U '`[^`\n]*\n[^`]*`'` over the reformatted tree, against a pristine baseline. A current
   figure measured on the latest patch is much harder to wave off than one from a retracted PR.
3. **File it** at github.com/dprint/dprint-plugin-markdown/issues with: the two-line before/after
   above, the recipe, the three characterized behaviors, the idempotency result, the re-derived
   count, and a narrow ask — *don't treat internal spaces of a code span as break opportunities*,
   with a config option as the fallback if the default must stay. Then comment the issue link onto
   #1634 so its done-when finally has something to watch, and delete this handoff.

## Reread first

* [`.github/dependabot.yml`](../../.github/dependabot.yml) — both ignore rules and their comments
* [`dprint.json`](../../dprint.json) — `textWrap: "always"`, `lineWidth: 100`, the plugin pins
* Splotch issue [#1634](https://github.com/KyleMit/Splotch/issues/1634) — the hold, its done-when,
  and the original 670/239 measurement
* Upstream PR [#130](https://github.com/dprint/dprint-plugin-markdown/pull/130) and issue #129 — why
  the behavior exists; read before arguing against it
* `tools/tests/issue-stack.test.mjs`, `tools/tests/skill-doc-links.test.mjs` — the two drift-guard
  tests that caught this locally; concrete victims worth citing upstream
* ADR-0057 (Prettier/dprint formatting split) — owns the `textWrap` setting
