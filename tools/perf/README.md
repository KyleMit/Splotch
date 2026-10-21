# Performance tooling leftovers

The SvelteKit and Capacitor capture harness that lived here was retired by #3160 (ADR-0182). The
React Native app's performance evidence is its in-app probe and replay traces;
[`docs/PROFILING.md`](../../docs/PROFILING.md) is the reference. The page-load gate that used to
borrow this folder's preview server serves the React Native web export from `tools/page-load/`
instead.

One piece stays, because code outside performance work depends on it:

| Module                                                                                 | Used by                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check-device-identifiers.mjs`, `lib/device-identifiers.mjs`, `lib/host-addresses.mjs` | `npm run check:device-identifiers`, the CI guard that fails on a hardware UDID or rig serial anywhere in the tracked tree, or a capture-host address in `perf-profiles/evidence/`. The native run scripts in `tools/mobile/` and the rival-agent poster read the same identifier shapes |
