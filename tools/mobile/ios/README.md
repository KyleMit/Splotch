# iOS tooling

This sub-capability owns the repository wrappers that run the iOS simulator smoke and reveal built
App Store artifacts. The remaining Xcode Debug/Release simulator builds, run, archive, export,
live-reload, and clean commands stay inline in `package.json`, as documented in
[`docs/MOBILE/ios.md`](../../../docs/MOBILE/ios.md).

## Entry points

| Entry point                    | Public command                      | Purpose                                         |
| ------------------------------ | ----------------------------------- | ----------------------------------------------- |
| `run-simulator-smoke-test.mjs` | `npm run test:ios [-- --skip-sync]` | Build, install, and smoke an iOS simulator      |
| `open-release-artifacts.mjs`   | `npm run ios:open`                  | Reveal `ios/App/build/ipa/` in the file manager |

The smoke runner requires macOS, full Xcode with an available iPhone simulator, installed project
dependencies, and Maestro. It reuses a booted simulator when possible, otherwise boots the newest
available iPhone, performs `cap:sync`, builds and installs the debug app, runs the shared smoke
flow, and shuts down only a simulator it started. Toolchain, build, install, Maestro, and simulator
errors exit nonzero after cleanup. Pass `--skip-sync` only when an immediately preceding command
already synchronized the native projects; the tagged deploy workflow uses it after
`ios:build:release` so its Release and Debug builds share one production web bundle.

`tests/ios-privacy-manifest.test.mjs` guards the committed native privacy declarations. Keep
simulator and Xcode lifecycle behavior here, shared Maestro execution at `../lib/`, and all native
project files under `ios/`. The release opener is intentionally specialized to the IPA output; add a
new owner-specific entry point rather than restoring a generic repository path opener. It also owns
the IPA output directory and file constants imported by release publishing, keeping that path
single-sourced without adding a support directory outside #975's mobile manifest.

Run focused verification with:

```sh
npm run test:tools -- tools/mobile/ios
```
