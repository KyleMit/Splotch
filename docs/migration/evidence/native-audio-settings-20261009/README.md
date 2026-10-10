# Provisional native Settings and drawing audio source

This feature is based on 64af9ba7c32b785dcef71ce7d9e3549f392cf5e5 in the isolated
`codex/native-audio-settings` branch. It is an unaccepted provisional source unit. No framework is
selected. Shipping web and Capacitor trees are unchanged.

The candidate adds an accessible Settings entry with one Sound switch. The new sound-v1 snapshot
contains exactly a version and boolean; canonical JSON, finite size and version are validated before
use. Failed reads start muted and expose recovery. Failed writes preserve the session choice and
provide Retry saving. Native writes a checked pending snapshot to a fresh committed revision, awaits
the move and confirms readback before pruning older revisions. It retains the immediately prior
revision. Browser localStorage has its own candidate-owned key and verifies readback. No legacy
settings or credential migration is added.

Drawing gesture samples feed a speed-scaled scratch loop. The copied MP3 and portable gain mapping
are drift-guarded against their shipping owners without importing the shipping browser/rune source.
The native adapter uses the released Expo Audio binding; the browser adapter uses Web Audio. Native
gain interpolation approximates the shipping envelope through wall-clock timers. Lift mutes and
pauses; mute, background, inactive and unmount abort pending initialization and remove/release
players. Late completion cannot start a departed stroke. A stationary held finger becomes quiet.
Load failures leave drawing usable and offer a sound retry through the switch.

The one clip currently reused is pencil-1.mp3. This source slice does not claim full audio parity:
clear-gesture bubbles/page-turn feedback, pencil recording variations, real speaker timbre and
latency, full drawing fidelity, long-session resource use and performance acceptance remain later
gates.

## Fresh package inspection

[package-provenance.json](package-provenance.json) records the exact candidate-only dependency delta
and both official registry archives. `expo-audio` 57.0.5 is the one new artifact; its peers use
already locked packages. `expo-asset` 57.0.18 is an actual new browser root for `Asset.fromModule`,
while its artifact is already in the Expo closure. Both versions match the current released Expo
57.0.26 SDK map. The official metadata, complete tarballs, extracted manifests and per-member hash
inventories are retained in `package-provenance/`. Neither artifact has lifecycle install or prepare
scripts, root hooks or root binding.gyp. No package scripts were executed by this inspection.

The optional audio config plugin is omitted from the maintained native projects: its recording and
background defaults are unused. The library's Android manifest contains only MODIFY_AUDIO_SETTINGS;
there is no microphone permission, recording service or iOS microphone purpose string in this
feature's source. Actual merged permission and native dependency graphs still need build inspection.

The accepted baseline and N1 archive/Forge inputs and F1 scanner/refusal implementation remain
unchanged. This feature's genuine new modules extend only the scanner test's expected inventory,
with direct new-module refusal controls. The new feature-owned `audio-lock-inputs.json` and
qualification module validate exactly two direct dev roots, one new artifact, unchanged inherited
lock entries and all eighteen finite Forge paths. Installed manifests remain inside this worktree
and match the freshly inspected archive manifests. SRI and archive SHA-256 are checked for both
roots. The existing N1 policies consume only the exact validated projection; their source inputs and
scanner/refusal implementation remain unchanged. `script-inventory.json` is a fresh actual-lock
delta inspection. The retained before lock is an inherited comparison boundary, not new runtime
acceptance.

## Validation state

The bounded source window used an own frozen pnpm install with both `--ignore-scripts` and
`--ignore-pnpmfile`. Resolution added 21 lock lines and removed none; one new package artifact was
installed. No prepare/install/postinstall hooks were executed. Exact commands, process start
identities, terminal exit codes and before/after source receipts are retained in
`controls/source-window-0541/`.

The first `npm run info` failed because this worktree had no installed scripts-info binary; after
installation the same command passed. The first candidate TypeScript check failed on a casing
collision between the Settings component and its model. Renaming the component to
`SoundSettingsSheet.tsx` repaired it and the check passed. Both original failures are retained.

Focused regression checks passed 127 tests in seven files, covering sound state/lifecycle, native
adapter cleanup, strict settings persistence, projection drift guards, actual source inventory and
rejecting lock/Forge controls. Candidate TypeScript, maintained-source candidate check, fresh audio
qualification, root `npm run check` and `npm run lint` passed. The source candidate check is not the
whole topology runtime check; closed baseline Forge controls were not replayed in this lease.

No full tools suite, browser/server/native build, device capture or playback was run by this owner.
The production browser adapter and native binding require real output in the next authorized window.
Full drawing/audio fidelity, supported floors, performance and product acceptance remain open. The
root coordinator owns formal review/publication, and this unit's original review budget is unopened.
