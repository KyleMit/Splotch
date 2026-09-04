# Style-cover asset tools

This directory owns the style-cover source drawing and its Gemini-backed generator. Run `npm run
gen:style-covers` from the repository root; generated covers are written to `web/static/styles/`.

The generator uses shared asset utilities from `../lib/`. Its source of truth is `source.svg` in
this directory, which keeps the workflow input beside the entry point that consumes it.

See [`../README.md`](../README.md) for credentials, review expectations, and the sanctioned imports
from the web application.
