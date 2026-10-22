---
name: cloud-preview
description: Serve and verify the React Native web export in a cloud session, and identify the supported public-preview path.
---

# Cloud preview

Use the `run-splotch` skill to build and serve the RN web export on an explicit free port. Retain
the managed terminal handle and verify the rendered page before reporting readiness. Read the
relevant cloud setup guide in `docs/CLOUD/` for browser dependencies and network access.

The Vite development server and its reverse-tunnel workflow retired with SvelteKit (ADR-0182). A
public phone preview uses an existing Netlify deploy preview. Do not present a loopback address as a
public URL or expose the isolated E2E host and its test credentials to the internet. Report the
actual deploy URL only after verifying that deployment exists; any new deployment follows the user's
publishing authorization.
