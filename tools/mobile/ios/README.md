# iOS tooling

This sub-capability owns the repository wrapper that runs the iOS simulator smoke. The release
builds (`ios:simulator`, `ios:archive`, `ios:ipa`) are `tools/release/build-native-release.mjs`, as
documented in [`docs/MOBILE/ios.md`](../../../docs/MOBILE/ios.md).

## Entry points

| Entry point                    | Public command                       | Purpose                                    |
| ------------------------------ | ------------------------------------ | ------------------------------------------ |
| `run-simulator-smoke-test.mjs` | `npm run test:ios [-- --skip-build]` | Build, install, and smoke an iOS simulator |

The smoke runner requires macOS, full Xcode with an available iPhone simulator, installed project
dependencies, CocoaPods, and Maestro. It builds the React Native app's store-identity Release
simulator app (`npm run ios:simulator`), then boots a shut-down iPhone on the newest runtime,
installs that app, runs the shared smoke flow, and shuts that simulator down. A simulator someone
else booted is never reused, installed to, or shut down: with every iPhone booted, the runner fails
instead. Toolchain, build, install, Maestro, and simulator errors exit nonzero after cleanup. Pass
`--skip-build` only when an immediately preceding `ios:simulator` built the app; the tagged deploy
workflow uses it so its build step and its smoke install the same app.

On a Maestro failure, the runner relaunches the same installed app briefly with its console
attached, writing `~/.maestro/tests/ios-app-relaunch.log` before simulator teardown. This is
diagnostic evidence from a second launch, not a retry of the assertion: the original failure still
exits nonzero even if the relaunch works or log capture fails. Its time budget is owned by
`lib/smoke-diagnostics.mjs`.

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
