# Selectable drawing and eraser widths

This feature extends the development candidate at c81312b3acc49f77890741d7042970dfa4b3f527 (tree
d3a528fcc071a458c414bc314dfef8a5b8ce2a95). Its dependency is the unaccepted eraser/composition
candidate, including its independent Audio, Brush, Contacts and Coloring review dependencies. It
does not select a framework or accept the migration. The applicable fresh-start contract was read
from integration object 9f64c4cb5604361f223690f1143296e8cd747c7d.

The Stroke Width Selector offers Thin, Medium and Thick. One row follows the active drawing or
eraser tool; the two choices persist independently. Medium preserves the candidate's exact Pencil,
Marker, Crayon, Magic and Eraser defaults (7, 22, 34, 30 and 44 paper pixels). Thin halves that
brush's default and Thick doubles it. Relative levels preserve each brush's existing character
without adding a separate settings owner or six permanent controls. Each target is at least 52
pixels in both dimensions, with a checkmark, border and accessible selected/disabled state.

Every admitted contact captures its actual paper-pixel width. Sampling, another contact, a tool
change or later settings hydration cannot replace that width. Drawing version 4 requires a valid
width for each stroke. Its strict reader accepts only the three supported pixel widths for that
brush, rejects missing/foreign fields and retains all earlier page/rainbow/seed/point constraints.
Candidate versions 1–3 normalize to version 4 using their exact prior brush geometry; this is
continuity within this new candidate, not a legacy beta-data import. SVG ink, textured Crayon, Magic
and chronological eraser masks consume the recorded width, including capture/replay.

The existing settings owner writes version 2 with sound, drawing width and eraser width in one
canonical snapshot. It reads the previous candidate sound-only version with Medium widths. Existing
native revision files and the web key retain their identity. There is one writer; a failed write
keeps all choices usable for the session and offers Retry saving in Settings. Retry writes the exact
retained snapshot. A malformed/unreadable snapshot mutes sound, uses Medium widths and reports
failure; it cannot silently claim persistence. Disposal suppresses late publication.

Focused controls exercise old/current model formats, malformed widths, actual responder admission,
shared Undo, clear/save/reopen, serialized settings writes, exact failure retry, visible selection,
touch targets and settings restart. Actual InkScene output is rasterized with Sharp to verify
distinct sizes for every paint brush, the eraser's removed region and exact save/reopen/Undo pixels.
These are renderer and SDK-boundary tests, not native-device, browser-layout, performance or release
acceptance. The checkpoint probe's current-model fixtures gain explicit default widths and version 4
without changing their points, colors, operation counts, masks or budgets. Historical parser
fixtures remain widthless; no broad guard inventory or threshold is relaxed.

Runtime screenshots on a compact phone viewport, actual native width drawing/save/reopen/export,
independent review and applicable full-tier checks remain pending until separately recorded.
