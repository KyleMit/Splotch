---
paths:
  - "docs/PROFILING-IPAD.md"
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

The same applies to the UI placeholders in these docs, for the same reason: write `Develop → ⟨your
iPad's name⟩ → …/dev/engine`, not `Develop → [your iPad's name] → …`.

**Scope: Markdown only, and only these files.** The `[Mac]` / `[iPad]` comment headers in
`tools/perf/probes/input-recorder.js` and `tools/perf/probes/engine-gates.js` are JavaScript
comments that no Markdown renderer ever sees — leave them alone.

**`docs/PROFILING-IPAD.md` is authored in place** — it is a document, not a generated skill file, so
there is nothing to regenerate after editing it. The `profiling` skill points at it (ADR-0107).
