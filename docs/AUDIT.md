# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

### [Tooling] Contact-sheet HTML has no `<title>`, so the prescribed "publish as Artifact" step names it after the temp file

**File(s):** `tools/asset-gen/gen-contact-sheet.mjs` (the `const html = \`<style>…\`` template, ~line 123)

#### Problem

`gen-contact-sheet.mjs` builds its HTML starting at `<style>` — it emits **no
`<title>` element**. The asset-gen docs (which this session just tightened) now
tell every asset session to rebuild this sheet and **publish it with the Artifact
tool "every time you touch an asset"** (`tools/asset-gen/CLAUDE.md`,
`README.md` → "Viewing a review sheet", `night-twins.md`). The Artifact tool takes
its browser-tab/gallery name from the HTML `<title>`, falling back to the file's
basename when there is none — so a sheet written to `.coloring-samples-dark/<cat>-contact-sheet.html`
(or a scratch `/tmp/review.html`) publishes as a meaningless filename. Cost: `minor`,
but it recurs on **every** asset-review session now that the workflow is documented as per-touch.

Evidence from this session: publishing the generated sheet as an Artifact first
failed —

```
Artifact({ file_path: …, title: "Splotch Contact Sheet — Nature", … })
→ InputValidationError: An unexpected parameter `title` was provided
  … Set the title via an HTML `<title>` tag in the file.
```

The invalid `title` param was self-inflicted and immediately corrected, but the
*reason* to reach for it — the sheet has no title of its own — is the durable gap.
The sibling generator already sets the convention:

```
tools/asset-gen/gen-coloring-sheet.mjs:131:
  const html = `<title>Coloring twins — tap to verify overlap</title>…
```

`gen-contact-sheet.mjs` is the outlier that diverged from it.

#### Proposed solution

In `gen-contact-sheet.mjs`, prepend a `<title>` to the `html` template, mirroring
`gen-coloring-sheet.mjs`, and interpolate the targets/source so the published
Artifact self-labels — e.g. `` `<title>Splotch contact sheet — ${counts.join(', ')} (${source})</title>` ``
ahead of the `<style>`. That makes the documented publish step produce a
correctly-named Artifact with no per-session guessing at a (nonexistent) `title`
param.

#### Verification

Run `npm run gen:contact-sheet -- nature --source shipped --out /tmp/cs.html` and
confirm the file begins with a `<title>` line (`grep -c '<title>' /tmp/cs.html`
returns `1`); publishing it as an Artifact then shows that title in the tab/gallery
rather than the temp filename.
