# shippingVNext progress

Branch `shippingVNext` off `origin/main` @ 30b2968faa7d, draft PR 3227 into `main`. **Never merge**:
the owner merges after the RN decision's last test (the iPad film session). Campaign evidence lives
on `origin/claude/rn-decision-2026-11` under `docs/scratchpad/2026-11-09-rn-decision/`; this branch
only cherry-picks from the campaign's branches and touches no physical device.

Each row records the commit, the gate it passed, and what is still unverified, so a later session
can resume from here.

## 1. Shipping fixes from the campaign

| Item                                                   | Commit(s)    | Gate                                                                                                 | Unverified                                                                                   |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Closing half-chord when a stroke lifts                 | 86f39ba2b342 | `npm run check`, `npm run lint`, drawing + design Vitest (71 files, 851 tests)                       | Real fingers on the iPad (campaign gated 0 cuts in 70 lines on the simulator)                |
| Drop WebKit's repeated pointermove                     | 935c108054e0 | as above                                                                                             | Real-finger start hook on the iPad                                                           |
| UIScene life cycle (iOS 27 SDK)                        | a84518e6e26f | as above                                                                                             | iOS simulator build and launch on iOS 27 (pending, item 2 Capacitor step); invite deep links |
| Hide Choose folder in the native shells                | dbd5121dac57 | as above                                                                                             | none beyond CI                                                                               |
| Landscape palette keeps the custom swatch on the 12.9" | 2449a4e9db8a | palette, picker, toolbar and safe-area E2E: 187 passed                                               | Real 12.9" iPad look                                                                         |
| Issue 2868: every swatch above the bottom inset (spec) | 15be9246fd93 | new assertion fails 8 iPad landscape cases on the pre-fix palette (negative control), passes with it | none                                                                                         |
| Bent strokes after Save on Android (export off GPU)    | pending      |                                                                                                      |                                                                                              |
| Audio context suspended when Sound is off or idle      | pending      |                                                                                                      |                                                                                              |
| Sound after an iPadOS audio-server crash               | pending      |                                                                                                      |                                                                                              |
| Renderer-gone handler, manifest `configChanges`        | pending      |                                                                                                      |                                                                                              |
| Durable in-progress checkpoint                         | pending      |                                                                                                      |                                                                                              |

## 2. Dependabot

Pending.

## 3. Open issues

Pending.

## Pending device checks

Written out once the items above land.
