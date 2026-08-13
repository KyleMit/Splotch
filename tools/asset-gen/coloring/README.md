# Coloring asset tools

This directory contains the entry points for generating, deriving, and checking coloring-book
assets. Shared image analysis, path resolution, and CLI helpers stay in `../lib/`; committed raw
fills, golden scores, and proof-sheet support assets remain in their existing sibling directories.

Run the public commands from the repository root. `npm run info` lists each command and its flags.
The command vocabulary distinguishes read-only checks (`check:*`), generated review artifacts
(`gen:*`), deterministic asset generation (`gen:*`), and intentional golden-baseline updates
(`update:*`).

See [`../README.md`](../README.md) for the full workflow and
[`../docs/pipeline.md`](../docs/pipeline.md) for the coloring pipeline contract.
