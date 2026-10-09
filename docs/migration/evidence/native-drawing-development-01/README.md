# N1 drawing development checkpoint

This is provisional development evidence for the existing N1 unit. It does not accept a migration
framework, optimized builds, device signing, performance, or the final migration. N1 retains its
original reviewer and two used rounds with one reserved round. F1 and PR2697 are not reopened.

## Working slice

The candidate implements bounded stroke data, Purple and other paint colors, Pencil and Marker,
Undo, Clear, real raster PNG export, app-private JSON save, a visible saved-picture list, and
reopen. History, drawing input, the screen, and platform file/share operations have separate owners.
The candidate has no import into shipping Svelte source; palette and light-theme values are finite
candidate-owned projections with drift guards against their shipping owners.

Browser interaction checks exercised drawing, color/brush changes, Undo, Clear, save, reopen,
export, and reopen after reload. Their style checks assert Purple/Blue stroke colors and Marker22 /
Pencil7 widths, plus the corresponding colors in decoded raster PNG bytes. The capped-stroke
regression drives the production interaction consumer through refusal, finish, parse, Undo and the
next stroke. Separate export-request ownership and primary-touch identity controls cover late
callbacks and a change of contact.

An iPhone simulator Debug build succeeded with zero errors and warnings. Expo's desktop activation
wrapper then failed; the installed app was launched with React Native's supported `RCT_jsLocation`
default and the owned Metro server. The preserved first Maestro flow failed on a selector after
successful stroke/save actions. Corrected flows subsequently passed reopen, second-stroke save, the
PNG share sheet, Copy, and reopen after terminating and relaunching the app.

The native saved two-stroke JSON is 3,300 bytes, SHA256
a30352795a0729f62d98ce52102c35af5f243dee7c4e480d9accbd0afb993e44. The production parser accepted
Purple/Marker and Blue/Pencil strokes with 67 points each. The native exported PNG is 187,143 bytes,
SHA256 a6bbf9ef5d2c6ce2b54d11abe610b786fd7aa34c649e4f6e8b4a8b0b4cb550fe. It decodes to 3072×2304,
with 131,168 exact Purple pixels and 37,827 exact Blue pixels. The native SVG renderer uses the
simulator's scale3 for a logical 1024×768 paper; the first 1024-pixel native expectation failed and
remains preserved. Browser export is 1024×768. The share-sheet screenshot alone is not the raster
proof.

The compiled app and first native flows used e836b73ac2731fd7e22853a5b334f7403ea4cfea plus the
captured Debug recipe. The executed-source snapshot binds the dirty recipe and JS bytes. The
generated bundle phase equals the independently derived maintained recipe. CocoaPods' generated
workspace is preserved privately, and maintained source files were restored before source checks.
This does not claim a fresh Debug rebuild from the final canonical checkout. Reproduction commands
are in [DEVELOPMENT.md](../../../../experiments/native-architecture/DEVELOPMENT.md).

A fresh simulator Release build from 20b51012a9bb3daa1314cab1d8c276cc9eb8a977 succeeded with zero
errors and one warning. Expo's desktop activation wrapper failed after installation; direct
`simctl launch` ran the embedded Hermes bundle with Metro stopped. Native interactions confirmed
both brush styles, Clear and Undo, save, a visible saved entry, reopen, PNG sharing with Copy, and
reopen after terminating and relaunching the standalone app. The first flow's final assertion used
stale success copy and failed after Copy; the separate confirmation used the actual rendered copy
and passed. The original failure remains preserved.

The Release-created cache PNG and saved JSON have the same deterministic bytes and hashes listed
above. Separate custody records bind their actual new production paths, creation and modification
times, before/after file identities, and exclusive copies. Decoded raster pixels and the production
JSON parser confirm both strokes. This evidence belongs to the Release run, rather than assuming an
earlier Debug cache file was fresh. Generated CocoaPods output is preserved separately from
maintained sources. The following CI repair removes two unused exports while retaining their
internal constants and values; this Release run predates that interface-only change.

Android Release from 95d1a47dd953b4d12fe48dd31da13ee8eed9a73b built successfully in two minutes 30
seconds, including all four declared native ABIs, the embedded Hermes bundle, minification and
resource shrinking. The first build refused missing library Build Tools 35.0.0. A fresh development
SDK copy added the host's already installed Build Tools 35 and platform-tools; the historical SDK
and first failure remain preserved, and maintained source, floors and guards did not change.

The signed APK is 64,297,279 bytes, SHA256
394b4a49ec17364be8e3f853264a9612ac7dc68fe6353692a99879722dcc5240. Signature verification passed with
one disposable v2 signer. Its manifest reports minimum API 24 and target API 36. Installation and
standalone launch succeeded on an existing API 28 emulator without Metro. Native flows passed both
styles, Clear/Undo, save, visible list/reopen, the system PNG share sheet, and reopen after
restarting the app. The owned emulator and test driver were closed after capture.

The production-created Android PNG is 18,485 bytes, SHA256
e33d9b5b943fd0e5ec4291c06bb0da4fa2a29027484a621fcd3fafc8c764508b. It decodes to 1024×768 with 13,930
exact Purple pixels and 3,782 exact Blue pixels. The 2,927-byte saved JSON, SHA256
a16982b8f6436bd7c488ffcb0bbbd9846a4aa61712b64b8316925fcb285aa09f, parses through the production
consumer as Purple/Marker and Blue/Pencil strokes with 59 points each. Source path/inode/mode/owner,
modification times, before/after metadata, guest hashes and exclusive copies bind the fresh files.
The first read-only remote stat command quoting error is preserved; its correction preceded file
capture. Generated Android Gradle/CMake output is preserved separately from maintained source.

## New dependency inputs

The exact direct development package declaration and manual alignment owner include the drawing,
web-preview, save and share dependencies. The unchanged registry/archive guard inspects only the
19558428a5caa16ed11ab5a18459050dfd7d5d6a-to-drawing artifact delta. Its original 22 rows include 21
newly required candidate artifacts and the root-only legacy-javascript update. The accepted security
merge f61f0c842abd2c4d4ab0eb1f3058786d245c444a replaces Handlebars 4.7.9 with 4.7.10. Only that new
archive was additionally inspected, against its merged lock integrity; it has no install hooks, root
hooks or binding.gyp. The final adjunct therefore has 23 inspected rows, with the original drawing
rows preserved. The original topology05 inventory remains unchanged and is composed with this
adjunct. Both package identities and registry SHA integrity are checked; omitted/corrupt archives
and new install, root-hook or binding.gyp edges remain refusals.

The five exact registry-publication `prepare` declarations were separately reviewed as inert:
cross-fetch3.2.0, css-select5.2.2, fbjs3.0.5, react-native-svg15.15.4 and styleq0.1.3. They are
dispositioned through the existing prepare-only policy. No prepare execution is admitted. The review
receipt is bound by SHA256 3bc68b368bf9b8808218dbe2b9c73bbb7a9c3606a495cbf19e2cfde25e00833d. The
first receipt associated root css-select4.3.0 with the new5.2.2 archive incorrectly; it remains
preserved, and the correction binds the actual SVG-owned nested5.2.2 manifest.

The N1 Forge adjunct first checks the complete real lock's exact eight paths and exact
expo-file-system57.0.7 / expo-sharing57.0.22 importer, artifact, snapshot and installed manifest
bytes. It then copies the lock, removes only those two direct development roots, and invokes the
unchanged four-path Forge policy and installed source/consumer/RSA guard. Every package, snapshot,
other importer and installed reference remains available to that guard. The result reports actual
eight paths and the baseline comparison four separately. Direct, production, foreign, aliased,
additional, unpatched and corrupt routes remain refusals. The original policy tests use the
byte-pinned complete195 lock fixture; new tests drive the actual final lock and production
composition. Neither the accepted mitigation source nor its mitigation input changed.

## Source validation

The merged development source passes type checking, lint, formatting, and the complete tools tier:
346 files and 8,101 tests. The real topology command reports eight actual Forge routes, four
baseline comparison routes, 23 additional archive rows and 21 newly required candidate rows. Its
installed Forge certificate/signature/CSR/tamper consumers remain required. The sandbox server
failures, full-tier Apple fixture timeout and signal-control timing failure remain preserved; the
latter controls passed alone and the final full tier passed without concurrent suites.

## Remaining acceptance

The later native save repair waits for Expo File System's asynchronous move before reporting
success. Write, readback and move failures clean only that save's original pending URI; a cleanup
failure preserves the original error, and a moved JSON file is never deleted through the mutable
File URI. Production-module tests cover delayed commit, rejection and cleanup, with source mutation
controls for the missing await and unsafe mutable-URI cleanup. The preserved Android and iOS Release
receipts remain evidence for their exact prior sources. Corrected-source native results and CI are
required before the original N1 review resumes.

This checkpoint has ordinary simulator/browser behavior, not final structural acceptance. A physical
phone was offline. Both platforms have standalone Release behavior; the iOS run predates the
interface-only export repair. Supported-floor runtime checks, lifecycle/multitouch coverage, and
matched performance evidence remain pending. The original failed qualification attempts remain
failed. Crayon/Magic and coloring-page work are separate feature units with an unaccepted N1
dependency.
