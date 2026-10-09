# Native coloring pages development evidence

The new coloring-page unit is implemented at fed2bab73711c865ff5dfa1139902cb4c4f0097c, on exact
first-slice N1 source ae4038f200f47d3b8f7f508c49c51a86197c8066. N1 remains unaccepted. Integration
must wait for its required acceptance and include its separately owned capped-stroke recovery
repair; this page unit does not repair or accept that obligation. No framework selection, native
build, physical qualification, or full-product acceptance is claimed here.

The production drawing snapshot contains a validated `PageId` and paint together. Sunshine, Garden
flower, and Little turtle are original authored vector outlines; Blank paper is also a choice.
Screen, picker previews, and PNG capture share the outline renderer. Changing to a different page
clears its paint as one undo transaction. Choosing the current page preserves it. Clear removes
paint while keeping the page. Undo restores both page and paint. Saved format version 2 persists the
page; actual version-1 first-slice pictures reopen as blank paper through the production storage
adapter.

## Observed running behavior

The [exact browser script](controls/browser-smoke.mjs.txt) drove the actual Expo/RNW development app
at owned port 5310 with two Metro workers. Both recorded Metro handles were stopped after capture.
The final [result](result.json.txt) records eleven successful product checks, including the named
picker, all choices, Green marker ink, undo/clear/blank transactions, save/reload/reopen, corrupt
page refusal, denied-save retention, phone bounds, and actual token-colored backdrop paint. There
were no browser page errors.

The genuine [composed PNG](composed-picture.png) is 1024 × 768. Pixel inspection found 4,861
expected Green paint pixels and 15,713 outline pixels. The
[saved source picture](saved-picture.json.txt) retains the selected flower and its real stroke
samples. Screenshots use 1024 × 900 and 390 × 844 viewports; their file hashes and prepared paths
are in [the manifest](manifest.json). The before capture uses the exact N1 base on the same
installed worktree, port, viewport, and Green marker fixture;
[its source record](before-source.json.txt) confirms no coloring-page control existed.

These are browser development observations of the shared product code. They do not establish native
SVG output, VoiceOver/TalkBack behavior, installability, floors, lifecycle, or signed distribution.
The known N1 cap-recovery dependency remains separate.

## Tests and controls

`npm run check`, `npm run lint`, and the native candidate TypeScript project returned exit 0. Lint
reported one existing unused-variable warning in `candidate-configs.test.mjs`. The three focused
model/interaction/page suites passed 32 tests; [the captured run](controls/final-focused.log.txt)
was taken after restoring every deliberate mutation.

Three narrow negative controls each produced assertion failures with exit 1: Clear replacing the
page with blank, page changes retaining paint, and the storage page guard accepting unknown values.
The [control manifest](controls/negative-controls.json) binds each altered source hash and exact
focused test pattern; mutation descriptions and complete failure logs sit beside it. The original
source bytes were restored after every control and the final worktree diff was empty.

The [development failure record](controls/development-failures.json.txt) preserves earlier actual
failures separately. Missing web selection state and transparent backdrop paint were product
failures, not deliberate negative controls. The turtle path-count miss was a smoke-fixture error.
Uncommitted intermediate scripts were edited in place and are not represented as exact retained
source snapshots.

The full tools tier and publication remain pending the coordinated native-build window at this
evidence checkpoint. Review and campaign registration are owned by the root session; this document
does not consume or reset N1/F1 reviewer identities or budgets.

## Running captures

| Before N1                                                                                                                                                           | Coloring page with paint                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![N1 drawing before coloring pages](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/before-n1.png) | ![Garden flower with a real Green marker stroke](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/flower-painted.png) |

| Picker                                                                                                                                                | Phone picker                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![All four page choices](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/picker.png) | ![Picker at 390 by 844](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/picker-phone.png) |

| Blank paper                                                                                                                                | Sunshine                                                                                                                                   | Little turtle                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Blank paper](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/blank.png) | ![Sunshine](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/sunshine.png) | ![Little turtle](https://raw.githubusercontent.com/KyleMit/Splotch/10bbcdbf75bbd257c938b724c88c6319a6683b4d/native-coloring-pages/turtle.png) |
