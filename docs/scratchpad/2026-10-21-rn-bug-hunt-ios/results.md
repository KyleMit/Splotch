# RN iOS bug hunt, 2026-10-21

The iOS part of the 2026-10-21 RN bug hunt. Two Codex workers covered RN web and the Android
emulators, and their sandbox could not reach the iOS Simulator. This run took the iOS-applicable
cases of their 63-case plan (`docs/scratchpad/2026-10-21-rn-bug-hunt/plan.md` on their branch; case
IDs below are theirs) and added iOS-only cases. It ran from 05:00Z to 06:35Z.

## Build and targets

* **Source:** `codex/native-migration` at 7eca9e4f8007026fbfa9ef5f78274da59d74ae2a. Release
  configuration, with the JavaScript bundle embedded and no Metro.
* **iPhone 17 Pro simulator, iOS 26.5.** A fresh device created for this run and deleted after it.
* **iPad Pro 13-inch (M5) simulator, iPadOS 26.5.** A fresh device created for this run and deleted
  after it.
* **Physical iPad Pro 12.9-inch, iPadOS 26.** About five minutes under the shared rig lock, for the
  cases that need real hardware.

Input came from Appium XCUITest W3C pointer actions (up to five simultaneous contacts) and hardware
keys sent through XCUITest. Device settings were changed with `simctl ui`, `simctl privacy` and the
simulator's `com.apple.Accessibility` defaults. Accessible names, roles, values and traits were read
from the XCUITest element tree. No VoiceOver speech was observed. Screenshots, element trees and the
iPad log archive stayed in the session's private scratch folder and were not committed.

## Defects filed

| Issue | Surface                                                                                                                | Reproduced                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| #3121 | iPadOS 26 window: the system window controls sit on the first palette swatch, so a tap there opens Close/Minimize/Zoom | iPad simulator 3×, physical iPad 1×                    |
| #3122 | iPadOS 26 window → Zoom: the palette moves under the status bar until the next rotation                                | iPad simulator 3×, physical iPad 1×; not every cycle   |
| #3123 | Grown-up check: equation and keypad digits clip from Accessibility Extra Large (AX3) up                                | iPhone simulator at AX3 and AX5, iPad simulator at AX5 |

A simulator build of the shipping app from the same commit (bundle `art.splotch.app.baseline`) shows
both window defects, #3121 and #3122, the same way. They are filed under the owner's rule, "whatever
is better", not as RN regressions. Shipping's WebView does not follow Dynamic Type, so #3123 has no
shipping counterpart.

Already open and not filed again: #2985 also covers Settings at the largest text size on the iPad.
There, the wide sidebar's fitted labels come out at very different sizes ("Appearance" and
"Accessibility" tiny, the rest large), and Button style clips at the bottom of a short dialog.

## Results by case

`Pass` covers only the assertions observed. `Blocked` names what was missing. `N/A` marks a web-only
or Android-only case.

### Drawing, color and history

| Case | Result  | Observed                                                                                                                                                     |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D01  | Pass    | Three separate zigzags gave three Undo steps, then Undo was disabled. The same paths as one contact gave one step                                            |
| D02  | Pass    | Pen: a slow line, a fast zigzag, and strokes past the top and right edges, clipped at the paper with no palette activation. A dot was not checked on its own |
| D03  | Pass    | The crayon texture rendered, and Undo removed only the last stroke                                                                                           |
| D04  | Pass    | Magic drew a rainbow on blank paper and revealed page colours on Farm › Cat and Space › Rover (iPad)                                                         |
| D05  | Pass    | Eraser at size 1 and size 5 cut through Pen, Crayon and Magic ink, and Undo restored the cut                                                                 |
| D06  | Pass    | iPad: five and two simultaneous contacts drew separate lines with no joins, and one Undo removed the whole cohort                                            |
| D08  | Pass    | Purple, Green and White/Black (the dark-theme retint) drew in their own colour                                                                               |
| D09  | Pass    | Dragging across the hexagons committed the colour under the finger at lift. The ink and the status band followed it, and the picker reopened                 |
| D10  | Pass    | The Pen and Eraser width flyouts were separate. Size 5 drew visibly wider and survived a relaunch                                                            |
| D11  | Pass    | 25 strokes allowed exactly 20 Undo steps, leaving the oldest five                                                                                            |
| D12  | Pass    | A short Clear drag kept the ink, a full drag cleared, and Undo restored it, on phone and iPad, in both themes                                                |
| D13  | Partial | With Reduce Motion on, Undo removed the stroke with no travel. The normal fly-away was not captured as motion                                                |
| D14  | Pass    | The drawer and flyouts opened and closed. Phone landscape replaced the palette with the Colors flyout                                                        |

### Settings and grown-up controls

| Case | Result  | Observed                                                                                                                                                               |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01  | Pass    | Hub sections, Back and Close on the phone. Wide sidebar navigation on the iPad landed each section at the top. The phone landscape shell offered its four controls     |
| S02  | Pass    | Light/Dark/System, Raised/Flat and Auto orientation applied at once and survived a force-quit and relaunch                                                             |
| S03  | Unrun   | Sound section not exercised; no audio observation on the simulator                                                                                                     |
| S04  | Pass    | With every optional tool off, the drawer kept Save and Coloring, and Pen drew. Turning everything back on restored the drawer                                          |
| S05  | Pass    | Button Size at 130% grew the drawer tiles to 65 pt. The OS Reduce Motion setting turned the in-app switch on after a relaunch                                          |
| S06  | Unrun   |                                                                                                                                                                        |
| S07  | Blocked | Saving an AI key verifies it with the production API first. There was no native fixture, so no dummy key reached the keychain                                          |
| S08  | Pass    | Auto-Save on Delete saved one picture to Photos on Clear                                                                                                               |
| S09  | Pass    | Five protections with Every time / Per session / Never. "Never" is disabled for external links                                                                         |
| S10  | Pass    | iPhone Install shows the Guided Access steps with "triple-click the side button"                                                                                       |
| S11  | Pass    | The feedback text view stayed above the keyboard. Send was hidden under the keyboard until a tap outside the field dismissed it. Nothing was sent                      |
| S12  | Pass    | What's New was readable at default and AX5                                                                                                                             |
| S13  | Pass    | About shows Version 1.6.0. At AX5 the GitHub icon touched "View", seen once and not filed                                                                              |
| G01  | Pass    | A wrong answer gave "Not quite — try this one" and a new problem                                                                                                       |
| G02  | Pass    | Three wrong answers: "Too many tries — wait 30 seconds" and every key disabled. Solvable after 30 s                                                                    |
| G03  | Pass    | Per session for Opening Parent Center skipped the check within the session and asked again after a force-quit. Never was not exercised                                 |
| G04  | Partial | iPad simulator with a hardware keyboard: digits reached the check. Backspace could not be injected reliably into a non-text responder by XCUITest, so it is unverified |

### Coloring, saving and lifecycle

| Case | Result  | Observed                                                                                                                                                                                                                               |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01  | Pass    | Farm › Cat decoded behind the ink in both themes. Clear kept the page art                                                                                                                                                              |
| C02  | Partial | The Space book opened and its Rover page loaded on the iPad. Download progress was not timed                                                                                                                                           |
| C03  | Blocked | The simulator shares the host network; it was not taken offline                                                                                                                                                                        |
| C04  | Unrun   |                                                                                                                                                                                                                                        |
| P01  | Pass    | Simulator: a 1206 × 2436 PNG of the ink on the paper colour landed in Photos. Physical iPad: two saves raised the Photos count by two                                                                                                  |
| P02  | Pass    | Five taps on Save inside the cooldown wrote one file                                                                                                                                                                                   |
| P03  | Pass    | With Photos denied, Auto-Save on Clear showed the failure banner. After permission was granted, the held picture reappeared at the next launch, and Try again saved it and dismissed the banner                                        |
| P04  | N/A     | Web folder picker                                                                                                                                                                                                                      |
| L01  | Pass    | Theme, style and Pen size survived a force-quit; the paint choice and ink started fresh, as specified                                                                                                                                  |
| L02  | Pass    | Portrait lock held the phone upright. On Auto, inked paper stayed portrait-fit in landscape; blank paper adopted landscape. Settings and the coloring picker rotated while open                                                        |
| L03  | N/A     | Android Back                                                                                                                                                                                                                           |
| L04  | Pass    | iOS form: backgrounding and resuming kept the ink and an open Settings dialog. Force-quit then relaunch: settings kept, ink blank. Backgrounding mid-stroke kept the partial stroke with no stuck contact                              |
| L05  | Blocked | Offline launch: same network limit as C03                                                                                                                                                                                              |
| L06  | Pass    | iPad simulator: 221 s of scribbles, five-contact strokes and brush switching, with no crash (same process). Undo and Clear worked afterward. The crash harness's S3 (120 random control taps, seed 7) on the iPhone simulator: `alive` |

### AI, web and accessibility

| Case    | Result  | Observed                                                                                                                                                                                                                                                                      |
| ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01–A08 | Blocked | No native AI fixture. AI stayed off on the simulators to keep requests off production                                                                                                                                                                                         |
| W01–W04 | N/A     | Web install and service worker                                                                                                                                                                                                                                                |
| X01     | Fail    | #3123 (grown-up check). #2985 covers the rest of the largest-size layout                                                                                                                                                                                                      |
| X02     | Pass    | The OS dark appearance applied live. The in-app Light theme overrode it, and Black retinted to White                                                                                                                                                                          |
| X03     | Pass    | With Reduce Motion on in the OS, Undo, Clear and the drawer worked with no frozen overlay                                                                                                                                                                                     |
| X04     | Partial | Every control has a name. Buttons, switches and the adjustable slider carry their traits, headings are marked, and disabled states show. Segmented and Parent Center choices expose "radio button, checked" as their value. Whether the modal contains VoiceOver needs speech |
| X05     | Blocked | No VoiceOver speech on the simulator                                                                                                                                                                                                                                          |
| X06     | Pass    | iPad simulator: hardware Cmd+Z removed exactly one stroke                                                                                                                                                                                                                     |

### iOS-only cases

| Case                          | Result  | Observed                                                                                                                                                                                                                                                         |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic Type through AX5      | Fail    | #3123. Hub, sections, Parent Center, Feedback and What's New scroll and stay readable on the phone. Restored to `large`                                                                                                                                          |
| Dark mode                     | Pass    | X02                                                                                                                                                                                                                                                              |
| Reduce Motion                 | Pass    | X03                                                                                                                                                                                                                                                              |
| Reduce Transparency           | Pass    | The dialog scrim went flat with no blur                                                                                                                                                                                                                          |
| VoiceOver labels and roles    | Partial | X04. The colour picker names hexagons by hex code, as shipping's `aria-label={hex}` does                                                                                                                                                                         |
| Rotation                      | Pass    | L02, on the phone, the iPad simulator and the physical iPad                                                                                                                                                                                                      |
| Background, resume, terminate | Pass    | L04                                                                                                                                                                                                                                                              |
| Memory warning                | Partial | After `notifyutil -p com.apple.system.lowmemory`, the app stayed alive and kept drawing. The simulator gives no proof UIKit delivered the warning to the app                                                                                                     |
| Photos denied                 | Pass    | The save failure banner explains the permission. Open Settings asks for the grown-up check first. With permission not yet decided, Save shows the add-only prompt, and Allow saves                                                                               |
| Photos limited                | N/A     | The app asks only for add-only access, which has no limited mode                                                                                                                                                                                                 |
| Notch safe areas              | Pass    | Portrait status band. In landscape, bands on both sides; the drawer, Settings, picker and dialogs stay inside the safe area                                                                                                                                      |
| iPad split view / windows     | Fail    | #3121, #3122. In a narrow window the palette shortens to four swatches and Settings uses the phone shell                                                                                                                                                         |
| Physical iPad hardware        | Pass    | Photos save (count +2), real rotation, and the drawing sound's audio session activating during strokes (unified log). No haptics: the iPad has no Taptic Engine (`Haptics: unsupported`). The only app error line in the log was an Accessibility runtime notice |

## Not filed

* **Appearance subtitle on the iPad.** The hub says "Night Mode · portrait lock" on the iPad, where
  no Orientation control is offered and the app rotates freely. Shipping's `sectionSubtitle` builds
  the same text from the same setting.
* **Flat toolbar's double rule.** Two thin lines under the Flat palette are shipping's margin rule
  (`BareToolbarPaper.svelte`), not a defect.
* **An unlabeled element in the tree.** The paper grain view has an accessible element with no
  label. Whether VoiceOver stops on it needs speech to tell.
