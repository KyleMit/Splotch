# Backlog

## TODO

* [ ] ipad landscape bottom row can sit flush. top status bar should have notch band
* [ ] returned AI preview should be much bigger and allow pinch to zoom
* [ ] include GHA versions in update-dependencies skill
* [ ] Possibly add "Check for updates" button on about parent center tab
* [ ] inefficent layout on iphone at tops and bottom
* [ ] Figure out what to do with existing drawing on orientation change
* [ ] Get rid of two row color palette on mobile landscape view
* [ ] Add sound effects when deleting
* [ ] Add even more color for extra tall landscape view
* [ ] Generate more fun store screenshots
* [ ] AI instruction for tiny marginal improvement (leave overlaid?)
* [ ] Efficiently layout broad range of colors on small devices in advanced color picker
* [ ] Parent center window should not bounce around in height so much when the height of content changes.  set min height.
* Icons
  * [ ] Document https://fonts.google.com/icons?icon.style=Rounded as icon source
  * [ ] Hand draw icons
  * [ ] Parent center control to increase button size
  * [ ] Make icons bigger on an ipad pro
* AI Art
  * [ ] If AI call fails and you need to try again, enable a way to do so immediately
  * [ ] AI Style buttons should use custom image and then generate corresponding output for each.
  * [ ] Build custom AI Prompts in the parent center.  Generate a logo for them from the base style and then enable.  Save logo locally
* Native build
  * [ ] Add /about page for marketing page with download links
  * [ ] Once ios and android stores ship, link to native downloads in parent center
  * [ ] Setup fastlane to automate store deployments
* Loading Spinner
  * [ ] Fun loading sound while AI is loading
  * [ ] Increase default timer
  * [ ] Increase size of pulsations when overtime
  * [ ] Start adding crazier and crazier animations if time goes super long
  * [ ] Add sparkles to AI Customization screen
* Coloring Book
  * [ ] Make sure book selection screen is scrollable.
  * [ ] Come up with other book selections
  * [ ] Pages should be able to be favorited. First book should be favorites
  * [ ] Delete should wipe the page (or first book should be to clear the background)
  * [ ] Add ability for users to upload color book bundles (IP hidden from iOS store release)
  * [ ] Generate coloring book workflow
  * [ ] Save to device.
  * [ ] Export/import
* Bugs
  * [ ] Sometimes it doesn't register clicks on color changes
* Controls
  * [ ] Brush type (blend mode with previous drawing)
* Feature ideas
  * [ ] Chalkboard/night canvas — dark background with chalk-textured or neon-glow strokes; cheap variety, great for bedtime wind-down use, and makes the bright palette pop
  * [ ] Stamps — third tool alongside pen/eraser: tap to plop a shape (stars, hearts, animals, dinosaurs) with a satisfying sound and a little scale-bounce animation; stamps recorded as ops in the command log so undo works automatically; unlocks the youngest users who can tap long before they can draw
  * [ ] Tap-to-fill (paint bucket) — flood fill enclosed areas, especially coloring book pages; gives the "I colored the whole elephant!" payoff when coloring inside the lines is still motorically hard, and works on the child's own color choices (unlike the magic brush's pre-colored twin)
  * [ ] Photo → coloring page — parent snaps a photo (the family dog, the kid's bike) and the existing Gemini pipeline turns it into line art that drops straight into the coloring book overlay slot; personalization families will tell other families about, and sidesteps the coloring-book IP problem on iOS
  * [ ] In-app gallery ("the fridge door") — revisit saved masterpieces inside the app (big thumbnails, tap for full screen, maybe a slideshow mode) instead of only the photo library/downloads; adds pride-of-ownership and a reason to come back, and pairs naturally with save-on-delete which already captures the art
  * [ ] Left-handed layout flip — Parent Center setting that mirrors the landscape layout so the palette column moves to the right edge (a lefty's arm covers it on the left)


## DONE


* [x] Drawing sound keeps playing when a mid-stroke swatch tap ends the stroke — `releaseAllPointers()` now fires `onDrawStopCallback`
* [x] Toddler Usability
  * [x] Multi-tapping on color picker should not immediately dismiss modal
* [x] Screenshots?  Screenshot on wipe?
* [x] Animation when selecting ring
* [x] Add Radial clear menu
* [x] Fix hex grid cutoff on some screen orientations
  * [x] Pure CSS (Container queries)?
* [x] Enable screenshot button
  * [x] Add screenshot animation
* [x] Remove paper edge filter
* [x] Try to replace howler and see how it goes
* [x] Fix when the cursor seems misaligned with the actual drawing point. looks like it's drawing a little bit to the right of my cursor
* [x] Fix Color picker selected color on active hex ring
* [x] Add control for Undo
  * [x] Undo after clear
* [x] Add control for Stoke width
* [x] Apply paper texture on screenshot
* [x] Smoothing algorithm for lines (get rid of rasterization)
* [x] screenshot expands back into camera instead of into delete button
* [x] AI-ify button
* [x] Separate out parent center buttons into settings / controls
* [x] Make control-z on desktop also perform an undo action
* [x] Make the secrets part of the env variable too (right now, they're public in git)
* [x] move CSS into component scoped styles
* [x] Make sure SVGs are handled efficiently.  Inline if possible.
* [x] Log usages of `ai_access_token`
* [x] Add note about `ai_access_token` to readme
* [x] Improve lighthouse score
* [x] Tap not working in drawing canvas, only dragging
* [x] Add record access token to parent settings in AI area with toggles disabled unless access token granted.
* [x] Progress meter or progressive fill in while image is generating
* [x] Only allow for pre-selected options in customization or have a separate setting to allow for custom prompt
* [x] Polaroid screenshot should be shape of canvas, maybe also add polaroid frame
* [x] Add download image animation and prevent multiple downloads
* [x] Add Eraser control
* [x] Increase size of line thickness pop-up
* [x] See what aspect ratios we can use when rendering an image - try to preserve current canvas
* [x] Make delete tutorial friendlier
* [x] Add playwright, especially so Claude can UI test
* [x] Make timer animation more fun
* [x] Put all controls in a side "drawer" that stays open / closed
* [x] Parent Center toggle should be to enable custom controls
* [x] Then progressively disclose which custom controls can be pinned
* [x] The eraser should show a size bubble where it's being applied
* [x] The eraser should use the stroke width levels for the pen, but should be about 20% bigger at each level.  It is hard to erase with the same exact size as the current pen.
* [x] Svgify the trash can icon
* [x] When advanced controls are enabled, all buttons should be in a drawer that can be opened and closed
* [x] Flash of 2 row configuration then 1 row
* [x] There are breadcrumbs on the /admin page, also add them to the /dev/ai-timer page
* [x] The eraser should show a size bubble where it's being applied
* [x] Add "color book" style picker with background overlay
  * [x] For the breadcrumb menu navigation, use the chevron-back.svg
  * [x] Make sure white backgrounds become transparent
  * [x] Make sure background works with screenshot feature
* [x] When hitting the AI option without customization enabled, it should also pull up loading spinner when clicked.
* [x] Full color the controls
* [x] Admin Center to provide access codes
* [x] Auto-save AI Art
* [x] Auto save AI generated images toggle. No longer need download button
* [x] Add BYO Key
* [x] On android, remove bottom nav bar and add app color to navbar cutout
* [x] Add about tab with splotch logo.  Figure out how to wrap tabs on portrait device
* [x] Remove install instructions tab from parent center on android/ios deployment targets
* [x] Maybe add route to confirm access token as well?
* [x] AI option without customization should also pull up loading spinner
* [x] Figure out release notes (in about tab) and proper versioning / ideally with gh releases
* [x] Fix graceful degradation of color palette
* [x] Don't include copyright coloring pages on mobile deployment
* [x] Do't use indexdb instead of localstorage - forces load into async
* [x] Make clear action more intuitive
* [x] Sound doesn't come in right away on fresh page load
* [x] Convert codebase to TS
* [x] Run all tests on CI
* [x] Add playwright test for multi-touch usage
* [x] Add parent center config for orientation change
* [x] E2e tests for native
* [x] Be able to regenerate metadata screenshot
* [x] Investigate line smoothing while drawing — `draw()` now replays coalesced pointer events and renders midpoint-smoothed quadratic segments
* [x] Replace server routes with API so I can have admin page on native
* [x] Make sure background works horizontally and vertically
* [x] Swipe through Parental Control Menu
* [x] Add volume slider setting
* [x] Claude workflow audit
* [x] Fix loading spinner not displaying 2nd time
* [x] Add iOS build bundle
* [x] /insights
* [x] /run-skill-generator
* [x] Make sure we can refresh PWA
* [x] Red hat test AI prompts
* [x] Update admin center to also include usage stats
* [x] Figure out if I need to log into netlify from CLI - document in pre dev step if so
* [x] Fix admin center persistence
* [x] iPad does not respect force landscape setting
* [x] flash of unstyled content on booting app in iOS where circle and trash can buttons start square and then become rounded
* [x] volume slider doesn't work with swipe between tabs on iOS
* [x] fix admin center not rendering on mobile
* [x] Add haptics for trashcan when in the clear accept zone
* [x] Native integration with apple pencil to use eraser
* [x] On android native in landscape, hide the status bar and move the NotchBand to the hole-punch side, reclaiming the long top edge as canvas
* [x] Prefer hidden system navigation bar in PWA to customized notch band
* [x] Fix controls drawer overlap from safe-area-inset
* [x] Add incremental version bumps to web.
* [x] prevent accidental swipes from bottom
* [x] Rule out using drag and drop API (doesn't work on mobile)
* [x] Do I need to enforce programmatically? Add linter or formatter? — ESLint + Prettier + CI quality gates (ADR-0031)
* [x] Run performance profiling and analyze results
* [x] Run performance profile on device

