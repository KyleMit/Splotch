# PR \#1134 — night halo gate, visual walkthrough

Evidence assets for the review comment on [PR \#1134](https://github.com/KyleMit/Splotch/pull/1134)
("Gate night-fill candidates on residual halos"). They live on this branch only, so the PR's own
diff stays code-and-notes.

`assets/` holds the eight figures the comment embeds. `scripts/` holds the throwaway generators that
produced them; they re-derive the same masks `tools/asset-gen/lib/night-halo.mjs` scores (punch
mask, 4px-dilated reference punch, ring bands 1–2, the rimΔ > 40 / luma 55–145 window) and paint
them over the shipped art, so every colored pixel in a figure is a pixel the scorer counted.

Regenerating them expects the PR branch checked out (`codex/issue-268-night-halo-gate`), the scripts
copied somewhere inside the repo so Node resolves `node_modules`, and `node fig<N>.mjs` run from
there. `mkdemo.mjs` writes an offline candidate into `.coloring-samples-dark/` for
`gen-night-fills.mjs --rescore`; `repunch.mjs` re-punches every committed night raw so `git status`
can prove the shipped bytes are unchanged.

Numbers quoted in the figures come from
`node tools/asset-gen/coloring/check-night-halo.mjs <categories>` over all 96 shipped night pages.
