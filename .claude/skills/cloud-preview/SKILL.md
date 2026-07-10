---
name: cloud-preview
description: Claude Code Cloud session only — start the dev server + reverse tunnel and report the public phone-preview URL
---

Start the live phone-preview tunnel for this **Claude Code Cloud** session
(ADR-0021, `docs/CLOUD.md`). This is *only* for cloud sessions — on localhost
there are simpler ways to view the app, so don't use this there.

`npm run dev:tunnel` is a **long-running** process: it starts `vite dev` on
`localhost:5173`, brings up the chisel reverse tunnel to the Fly relay, waits for
the public URL to answer 200, prints it, and then holds open until stopped.

Do this:

1. Run `npm run dev:tunnel` **in the background** — do not wait for it to exit.
2. Watch its output for the readiness line (`➜  Live:  https://…`) or a failure
   (`✗ …`, e.g. `TUNNEL_AUTH is not set`).
3. Report the public URL once it's live so it can be opened on a phone. If it
   failed, report the error and the likely fix (usually a missing `TUNNEL_AUTH`
   in the cloud env config — see `.claude/cloud/environment.example`).

Notes:
- This serves a **dev** build — no `/api/*` serverless functions. Those need
  `npm run dev:netlify` (which the tunnel script does not use).
- Leave the process running until the user asks to stop it.
