# AI on the native apps: a real picture and saving it (Galaxy, best versions)

2026-11-11 01:31–01:47 EST, Claude (lane ai-native). The Galaxy, best versions: RN
`art.splotch.app.dev.best` (v2, `claude/best-rn` @ `e703b8b79a08`) and shipping
`art.splotch.app.baseline.best` (`claude/best-shipping` @ `f9d3b6ff67d5`). Both call production
`https://splotch.art`, which served `1.6.2690` (the AI fix from PR 3223). Driven with
`adb shell input` under `dev-galaxy.lock`. Raw media is in `campaign/ai-native/` in the rig scratch
folder.

## What would matter (named before measuring)

* **Blocker:** one arm cannot get from a drawing to a real AI picture, or cannot save it, where the
  other can.
* **Major:** in one arm only, a path that strands the child (a spinner that never ends, a blank or
  cropped picture, a crash) or misleads the parent (a save that reports success but leaves no file,
  or a file that is not the picture).
* **No signal:** the same server behaviour in both arms. Both apps call the same production server.

## The Galaxy has one free creation, shared by both arms

Turning on Settings › AI Art showed **"1 free AI creation left."** in both apps. Every test build on
the Galaxy is signed with the same debug key (`dumpsys package`: one signature hash across `.dev`,
`.dev.best`, `.dev.mem`, `.baseline.main` and `.baseline.best`). Android gives apps that share a
signing key the same `ANDROID_ID`. Both arms derive the free-allowance pseudonym from it
(`SplotchAIEnvironment.kt` `installationValue()`; ai.md §1). So the Galaxy holds **one grant for
both arms**, 9 of its 10 already used before the campaign, and the server allows 10 per pseudonym
for life (`freeGenerationGrants.ts`). The plan of two pictures per arm could not run. This comes
from the test rig, not from either app: a store user has one app.

The one creation went to **RN**, whose native AI client (async ticket, native decode, journal,
native save) had never produced a real picture on a device. Shipping's Capacitor path is the one the
store app already uses. Shipping then hit the used-up state, asked for an OpenAI key and was stopped
there, as this lane's rules require.

## Attempts

| # | Arm           | Drawing                            | Press → picture                                                                                           | While waiting                                                                                                                                                                     | Result screen                                                                                                                                                                          | $ (ledger)          |
| - | ------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1 | RN best v2    | house + sun, Crayon (blue, yellow) | **38.2 s** to the result card, picture fully in at 39.0 s (screen polled every ~0.7 s, OCR of each frame) | polaroid with the child's drawing filling in behind a progress dial, confetti; "Making your picture… / This takes about 30 seconds"; "Keep drawing while you wait"; no stall seen | a real "Magical" picture (blue house with a glowing door, sun, meadow, sparkles), full portrait frame, nothing cropped; **Download**; "AI-generated picture · Report"; badge 1 → **0** | 0.06                |
| 2 | shipping best | same house + sun, Pen              | none: at 2.2 s the app opened Settings › AI Art                                                           | "Making your picture…" for ~1–2 s                                                                                                                                                 | **"Your 10 free AI creations are used up. Add your own OpenAI API key to keep creating."** with the key field. The badge had still read 1 (counted before RN's run). Arm stopped here  | 0.06 (refused, ~$0) |
| – | both, at 0    | –                                  | –                                                                                                         | –                                                                                                                                                                                 | AI button stays visible with a **0** badge in both; tap → Grown-Ups gate → the same used-up page and key field. Same copy in both. Stopped                                             | 0                   |

Logcat for attempt 1 holds no app error or warning beyond two property-access lines. No crash and no
ANR in either app.

## The save check

| Arm      | Path                                                                                                                                                                             | File in the gallery                                                                                                                                                                                                                   | Is it the AI picture?                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| RN       | Download: the card flies away like a polaroid (no text toast), and the paper comes back with the drawing kept. The file existed 1 s after the tap. No permission prompt (API 36) | MediaStore id 1000000906, `Pictures/Splotch/splotch-ai-2026-11-11_01-36-31.png`, owner `art.splotch.app.dev.best`, **PNG 1024×1536**, 8-bit RGB, 1,832,512 bytes, sha256 `2f7e4e59…da51`. It was the only new gallery row in the lane | **yes**: pulled and viewed. The same picture as the result card, full frame, colours intact, not the drawing |
| shipping | not reached (no picture)                                                                                                                                                         | –                                                                                                                                                                                                                                     | –                                                                                                            |

Desk check for shipping: `saveAiResult` (`web/src/lib/ai/resultSave.ts`) saves the result through
the same `saveImageBlob` pipeline as every drawing save. On Android that pipeline already lands
1080×2016 PNGs in `Pictures/Splotch` (journeys-android J10). RN's `keepAiPicture` mirrors it
(`savePicture`, base name `splotch-ai`, format as received). The production server returns PNG,
because `openai.ts` sets no `output_format`.

## Side check: a stroke right after tapping a colour

The first shipping drawing lost both strokes that began right after a colour tap (the box and the
sun circle). RN lost neither. Retrying 2 s after each tap inked both. In a quick `adb shell input`
check (a tap, then a line with no sleep, 0.5 s or 1 s), shipping lost 2 of 2 lines with no sleep and
RN lost 1 of 2. Both drew every line at 0.5 s and 1 s. `input` spawns a process per command, so "no
sleep" means an unknown gap of about 0.1–0.3 s.

On-device timing gives the real answer. A uinput dot train (the spike-input-loss lane's method: 19
dots every 40 ms, starting 60 ms after a blue-swatch release; 2 runs per arm):

| Arm      | Run a: last lost / first drawn | Run b        |
| -------- | ------------------------------ | ------------ |
| shipping | 60 / 100 ms                    | 100 / 140 ms |
| RN       | 60 / 100 ms                    | 60 / 100 ms  |

**Parity.** Both arms take a touch 100–140 ms after a colour tap. The whole-stroke loss in shipping
is an artefact of `adb shell input`, not a defect. Lanes that draw with `input` should wait about
0.5 s after a colour tap. Scripts: `ai-native/bin/swatchgen.py`, `swatchrun.zsh`.

## Defects and findings

| # | Finding                                                                                                                                                                                        | Arm                | Severity                      |
| - | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------- |
| 1 | None found in RN's real-picture path: drawing → gate → style → waiting → picture → Download → correct PNG in the gallery                                                                       | RN                 | –                             |
| 2 | Shipping's real picture and save were not tested on a native device: the Galaxy's only free creation is shared with RN (rig artefact)                                                          | shipping           | open, not a defect            |
| 3 | The wait card says "about 30 seconds"; this picture took 38 s. One sample; the copy and the polling are the same in both arms (the server asks for a poll every 3 s). Not an arm difference    | both (shared copy) | cosmetic, unverified          |
| 4 | ai.md's "RN reaches the error card ~5 s later" is still unverified. 38 s against the 23 s server-only time PR 3223 recorded is no evidence: different drawing, orientation and provider minute | RN                 | minor, unverified (unchanged) |

## Spend

Two rows in the ledger, written before each attempt: `galaxy-rn-best` 0.06 (one real picture,
billed) and `galaxy-shipping-best` 0.06 (refused for the used-up grant before any provider call,
probably $0). Lane total **$0.12** of its $0.60. Campaign ledger total $0.90 of $10.

## Device state left behind (the Galaxy)

* The free grant shared by every debug-signed build on the Galaxy is **0**. A further Galaxy AI
  generation needs a credential or a build signed with another key.
* Both best builds: AI Art turned on for the run and **turned off again**, so the tool drawer's
  layout is as it was (the AI button moves Undo). Page cleared, Purple selected, the brush
  unchanged; the launcher is in front. RN's Undo is live (it can undo the Clear).
* One new gallery picture, listed above; nothing deleted. The 52 earlier test pictures are
  untouched.

## What would close the gap

The shipping arm needs its own grant. On the iPad, the two best builds should have **separate**
grants. iOS bases a non-App Store app's vendor ID on its bundle ID minus the last part:
`art.splotch.app.dev` for RN and `art.splotch.app.baseline` for shipping. This is expected, not yet
seen. When the iPad frees up: one picture per arm, Download, check Photos, about $0.12.

## Could anything here flip the decision?

No. RN's native path makes, shows and saves a real AI picture correctly on the Galaxy. Shipping's
native path was not reached, because the rig shares one free grant between the arms. It is the path
the store app runs, so a failure there would surprise. Even a failure would help RN only on a
secondary feature.

Key screenshots (campaign scratch `ai-native/`): `runs/rn-1/strip-wait-result.png` (waiting →
result), `shots/r1-result.png`, `shots/r1-download-pair.png`,
`saved/splotch-ai-2026-11-11_01-36-31.png`, `runs/sh-1/strip.png` (shipping used-up page),
`shots/r4-zero-after-gate.png` + `shots/s4-zero-after-gate.png` (0-badge parity), `runs/sw-rows.png`
(dot trains).

## iPad, best versions (2026-11-11)

08:27–08:41 EST, Claude (lane L). The iPad (iPad Pro 12.9-inch 5th gen, iPadOS 26.5), landscape,
dark paper. Shipping best `art.splotch.app.baseline.best` (`claude/best-shipping` @ `f9d3b6ff6`) and
RN best v2 `art.splotch.app.dev.best` (`claude/best-rn` @ `e703b8b79`), both calling production
`https://splotch.art` (served `1.6.2690`). Driven through an own WebDriverAgent with fixed
coordinates under `dev-ipad.lock`. The same house + sun as the Galaxy run: the strokes from
`draw.py`, scaled ×0.6 into points, in Blue then Yellow, on Pen Size 3 in both arms. Wait timed from
the Magical tap request to the first screenshot showing the result card (screenshots every ~0.5 s,
OCR of each frame), so each wait is good to about ±0.6 s. Raw files: `ai-native/ipad/` in the
campaign scratch folder.

**The iPad gives each arm its own grant**, as predicted above. Both apps read "10 free AI creations
left." when AI Art was turned on, and each dropped to 9 after its own picture only.

| Shipping best                | Result                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Art as found              | off (turned on for the run, turned off again after)                                                                                                            |
| Badge before / after         | 10 / **9** (drawer badge and Settings › AI Art text)                                                                                                           |
| Path                         | AI button → Grown-Ups gate (5 × 5) → Pick a style → Magical                                                                                                    |
| While waiting                | polaroid with the drawing behind a progress dial, confetti; "Making your picture… / This takes about 30 seconds"; "Keep drawing while you wait"; no stall seen |
| Tap → result card            | **≈ 29.4 s** (last waiting frame 28.8 s, card at 29.4 s)                                                                                                       |
| Result card                  | a real Magical picture: blue house with a glowing door, sun, meadow, stars; landscape, nothing cropped; Download; "AI-generated picture · Report"              |
| Error text                   | none                                                                                                                                                           |
| Download                     | the card flies away like a polaroid (no text toast); the paper comes back with the drawing kept; no permission prompt                                          |
| Photos                       | **IMG_0932.PNG**, PNG 1536 × 1024, 8-bit RGB, 1,873,159 bytes, mtime 08:33:26 (tap 08:33:25); the only new picture                                             |
| Is it the AI picture?        | **yes**: pulled with `afc pull`, decodes, and is the picture on the result card, not the drawing                                                               |
| Generations (`ai-spend.tsv`) | 1 (`ipad-shipping-best`, 0.06)                                                                                                                                 |

| RN best v2                   | Result                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI Art as found              | off (turned on for the run, turned off again after)                                                                                                       |
| Badge before / after         | 10 / **9**                                                                                                                                                |
| Path                         | AI button → Grown-Ups gate (3 × 3) → Pick a style → Magical                                                                                               |
| While waiting                | the same polaroid, progress dial, confetti and copy as shipping; no stall seen                                                                            |
| Tap → result card            | **≈ 38.9 s** (last waiting frame 38.4 s, card at 38.9 s, picture fully in at 39.5 s)                                                                      |
| Result card                  | a real Magical picture: blue house with a glowing door, sun, glowing ground, stars; landscape, nothing cropped; Download; "AI-generated picture · Report" |
| Error text                   | none                                                                                                                                                      |
| Download                     | the same polaroid fly-away, drawing kept, no prompt                                                                                                       |
| Photos                       | **IMG_0933.PNG**, PNG 1536 × 1024, 8-bit RGB, 1,863,394 bytes, mtime 08:40:08 (tap 08:40:08); the only new picture                                        |
| Is it the AI picture?        | **yes**: pulled, decodes, and is the picture on the result card                                                                                           |
| Generations (`ai-spend.tsv`) | 1 (`ipad-rn-best`, 0.06)                                                                                                                                  |

Two generations, no retry; lane total $0.12. The two waits (29 s, 39 s) are one sample each against
the same server minutes apart; the copy and the 3 s poll are shared, so the 10 s gap is not an arm
difference. RN's 39 s matches its 38 s on the Galaxy. Both arms saved the full 1536 × 1024 picture
the server returned, so neither crops or re-encodes it.

### Not tested

* Any error path on the iPad (a provider failure, offline, the used-up grant, closing the card while
  waiting, leaving the app mid-wait). The Galaxy run covered the used-up page (same copy in both).
* Auto-Save AI Images (off in both), the Report link, and a second picture in a row.
* Portrait. Other styles than Magical.
* One frame of RN's AI Art page, 1.5 s after turning AI off, showed the three "What turning this on
  does" pictures as empty dark tiles; they showed when the page first opened. One frame, not
  repeated; cosmetic at most.

### State left behind (the iPad)

Both best apps: AI Art **off** again, page cleared (Auto-Save on Delete off, so no picture), Pen,
Purple, Size 3 (read from the size menu), dark paper; RN best in front. Each app's free grant is
now 9. Photos: two new pictures, IMG_0932 (shipping) and IMG_0933 (RN); nothing deleted. Never
locked, no system prompt, store app and every other app untouched, no Instruments. Own WDA stopped;
`dev-ipad.lock` released 08:41.

### Could this flip the decision?

No. On the iPad both arms make, show and save the real AI picture the same way: same flow, same
copy, same file type and size, same polaroid save. That closes the "shipping's native AI success and
saving" unknown with parity.
