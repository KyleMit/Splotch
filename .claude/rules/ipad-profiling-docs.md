---
paths:
  - ".ruler/skills/profiling/ipad-device-profiling.md"
  - ".claude/skills/profiling/ipad-device-profiling.md"
  - ".agents/skills/profiling/ipad-device-profiling.md"
  - "docs/notes/ipad-perf-plan.md"
---

# iPad profiling doc rules

## Tag the machine with `⟨Mac⟩` / `⟨iPad⟩`, never `[Mac]` / `[iPad]`

Every step in the iPad runbook says which machine performs it. Write that tag in **angle brackets**:

```markdown
**⟨Mac⟩** Start the preview server. **⟨iPad⟩** Open the Harness URL in Safari. **⟨Mac⟩ + ⟨iPad⟩**
Connect over USB and tap Trust This Computer.
```

Square brackets make `[Mac]` a **shortcut reference link** with no matching definition. It renders
as literal text, so nothing visibly breaks — but markdownlint flags every one (MD052) and editors
highlight them as broken links, which buries real problems in the noise.

The same applies to the UI placeholders in these docs, for the same reason: write
`Develop → ⟨your iPad's name⟩ → …/dev/engine`, not `Develop → [your iPad's name] → …`.

**Scope: Markdown only, and only these files.** The `[Mac]` / `[iPad]` comment headers in
`scripts/perf/ipad-recorder.js` and `ipad-console-driver.js` are JavaScript comments that no
Markdown renderer ever sees — leave them alone.

**Reminder:** the `.claude/` and `.agents/` copies are generated. Edit
`.ruler/skills/profiling/ipad-device-profiling.md`, then run `npm run ruler:apply`.
