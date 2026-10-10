# Custom paint read-failure composition

The feature resumes from 79b6c9c4dee609c9825288b297e0c90030a479c6 and composes the same Width
owner's repair 8a0e0e72e17219d0c2f921b0d71b5357b3fcf3c9, tree
3ed898cc6783ebc00c4d8b75e0024415b02a1fef, parent 7bcc4ff65139d6305e70e456d0911c1fdf60e840. The merge
resolves the v2/v3 snapshot shape while retaining the owner's read-failure barrier. The custom
`setColor` caller adopts that barrier without adding a storage key or writer. Read-failed color and
width choices remain in session; only an explicit Settings sound choice or Retry saving permits
persistence. Known-read write failures still permit later paint saves.

The initial focused command exited one: three files, 67 passes and four failures. Two new color
controls reproduced five unintended writes of fallback preferences after a read failure. Two
inherited width controls caught a merge-composition error that exposed wire version metadata in
session state; the resolution publishes choice fields only. The original output is retained in
`controls/read-failure-initial.log.txt`.

The repaired focused controls pass three files / 73 tests. They compare unread storage bytes, reopen
its actual original palette/sound/widths independently, retain the warning through named and custom
taps and MRU changes, exercise both explicit recovery actions, reopen the recovered full v3 snapshot
and distinguish a failed known-read write. Mounted screen callers exercise More colors, Use color,
actual settings-owned stroke color, selected swatch, visible warning and both Settings recovery
controls.

The expanded scoped tier passes 18 files / 280 tests with one worker in 14.98 seconds. Candidate
TypeScript, root check, lint and formatting exit zero. The `read-failure-*` controls retain the
initial failure and each scoped/check receipt; they do not replace the initial feature's logs.

Full tools, browser resize/layout/touch, native feedback and publication remain held for Root's host
allocation. No independent review or campaign acceptance is claimed.
