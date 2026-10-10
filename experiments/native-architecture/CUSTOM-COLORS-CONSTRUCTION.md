# Custom paints and a small saved palette

This new feature starts exactly from the unaccepted Width source
4b1882fb7dd41cf7b4387bdc323c6698f798d6e9, tree 2805de485bc7d394a08e0e87a1cfb87cc1860151. It retains
that unit's Eraser, Audio, Brush, Contacts and Coloring dependencies. The governing README,
fresh-start/functional-development contract and color acceptance were read from integration object
9f64c4cb5604361f223690f1143296e8cd747c7d. This construction neither accepts its dependencies nor
selects a framework or completes the campaign.

The feature includes a normal merge of Width's documentation-only update
7bcc4ff65139d6305e70e456d0911c1fdf60e840 without rebasing or replacing product source. The planned
dependent draft targets `codex/native-stroke-widths`; publication waits for the applicable full test
tier.

“More colors” opens a continuous hue/tone field with a visible color preview. Dragging explores;
lifting keeps a tentative color in the picker. “Use color” selects it for drawing and remembers it
with six distinct recent custom paints. Reusing a custom paint moves it to the front. Named paints
remain available. The rectangular field has no inter-tile gaps; exploration clamps outside its
edges. Twenty-five native button targets provide discrete accessible alternatives. This new flow
preserves exploration and selection without copying the old hexagonal layout or choreography; its
product disposition remains subject to independent review.

The field's button targets and saved swatches use the candidate's 52-pixel touch floor and existing
design vocabulary. The modal scrolls on compact layouts, names itself, supports native Back/web
Escape and uses the installed React Native Web focus trap/restoration. Web selected buttons carry
explicit `aria-pressed`; the native selected-state object alone does not implement web semantics.
React Native Web renders these buttons as actual HTML buttons. Its independent physical click
callback is ignored for explorer tiles after a responder gesture, so a trailing click cannot replace
the continuous lift color with the discrete tile center. Virtual clicks remain available. Happy DOM
does not synthesize their browser-default click from artificial key events, so the
installed-renderer unit asserts their native element and click behavior; real browser keyboard
validation remains pending.

The picker acquires the same synchronous drawing input lease as Settings. It cannot open during an
admitted contact. Drawing waits for settings hydration. The custom palette reserves one fixed-height
horizontal row, so adding or evicting a paint cannot move the paper beneath a contact. Each admitted
stroke retains its own color and width, including simultaneous contacts and shared Undo. Picker
geometry changes, scrolling, cancellation, extra contacts and backgrounding cancel exploration;
stale measurements cannot replace a newer field frame. Dismissal never applies the tentative paint.
The viewport-sized backdrop refreshes geometry when centered fixed-size content moves after resize;
the running resize/cancellation check remains pending.

Drawing version 5 accepts named colors or canonical uppercase six-digit custom hex values only.
Earlier new-app versions 1–4 normalize explicitly without changing stroke points, colors, widths,
seeds or page-fixed Magic. This is continuity within the new app, not legacy beta-data transfer.
Pencil, Marker and Crayon consume recorded paint; Magic remains paper-fixed. SVG pigment identifiers
use validated actual hex values, share equivalent named/custom Crayon definitions and keep separate
artwork scopes. Saved drawings keep their colors independently of palette eviction.

The existing settings writer stores version 3: sound, both widths, selected paint and custom paints
in one canonical snapshot. Its existing web key and native revision files remain the only storage
paths. Failed writes retain all session choices and the exact retry snapshot; unreadable data
reports failure and explicit defaults. Old sound-only and width snapshots normalize safely. No new
dependency, installation, permission or native materializer was added.

Validation failures and repairs are preserved under
[construction controls](../../docs/migration/evidence/custom-colors-construction/README.md). Initial
TypeScript rejected unsupported native `touchAction`; the responder uses event prevention and a
scroll lock instead. Initial lint size failures were repaired by extracting the consumed palette
component, picker gesture hook and sheet rendering, without cap waivers. Old fixture guards were
updated for the explicit version normalization, keeping v4 fixture bodies and stroke JSON bytes
unchanged. A mounted test consumer was repaired to read the same settings-owned paint as production;
the Crayon oracle follows the safe pigment identifier. Root source inspection caught and removed a
stray fragment space that native View cannot render outside Text. The click-control test's omitted
helper import was caught by scoped tests and lint, then repaired. Initial dprint cache access failed
under the sandbox; verification uses an owned temporary cache. The final scoped run passed 18 files
/ 270 tests; candidate TypeScript, root check, lint and formatting passed.

Scoped model/storage, mounted flow, installed-renderer and PNG checks do not establish browser touch
layout, physical native rendering, performance, signing, release or independent acceptance. Full
tools validation and a compact browser demonstration await the root coordinator's host allocation.
The shortest running check is an owned development web bundle at 320-pixel portrait and compact
landscape, plus a wide-window resize with the picker open and during exploration: touch
exploration/lift, keyboard and focus, selected swatches, restart, mixed brushes, Clear/Undo,
save/reopen and actual PNG export. Native feedback follows the campaign's shared build.
