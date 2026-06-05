# Backlog

## TODO

* [x] Convert codebase to TS
* [x] Run all tests on CI
* [x] Add playwright test for multi-touch usage
* [ ] Run performance profiling and analyze results
* [ ] Add style guide
* [ ] Add haptics for trashcan when in the clear accept zone
* [ ] Add sound effects when deleting
* [ ] Add even more color for tall landscape view
* [ ] If call fails and you need to try again, enable a way to do so immediately
* [ ] AI Style icons should use custom image and then generate corresponding output for each.
  * [ ] Currently not a big difference between default and cartoon
* [ ] Red hat test AI prompts
* [ ] AI Style icon that allows for manual text input to customize prompt. does not need to also respect style selection
* [ ] Fun loading sound while AI is loading
* [ ] Hand draw icons
* [ ] Increase default timer
* [ ] Increase size of pulsations when overtime
* [ ] Start adding crazier and crazier animations if time goes super long
* [ ] Add sparkles to AI Customization screen
* [ ] Parent center control to increase button size
* [ ] Investigate line smoothing while drawing
* [ ] Efficiently layout broad range of colors on small devices in advanced color picker
* [ ] Refactor to use drag and drop API (doesn't work on mobile - polyfill?)
* [ ] Coloring Book
  * [ ] Make sure background works horizontally and vertically
  * [ ] Make sure book selection screen is scrollable.
  * [ ] Come up with other book selections
  * [ ] Pages should be able to be favorited. First book should be favorites
  * [ ] Delete should wipe the page (or first book should be to clear the background)
  * [ ] Add ability for users to upload color book bundles (IP hidden from iOS store release)
* [ ] Bugs
  * [ ] Make sure we can refresh PWA
  * [ ] Sometimes it doesn't register clicks on color changes
* [ ] Controls
  * [ ] Brush type (blend mode with previous drawing)


## DONE


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
