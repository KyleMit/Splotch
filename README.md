# Splotch 🎨

A simple, delightful drawing app designed for toddlers (2+ years old). Features large touch targets, cheerful colors, and subtle drawing sounds to create an engaging creative experience.

<https://splotch.art/>

## Features

* **Simple Drawing Interface** - Just touch and draw with your finger or Apple Pencil
* **Paper Texture Canvas** - Subtle grain effect makes it feel like drawing on real paper
* **Kid-Friendly Color Picker** - 7 vibrant colors (purple, blue, green, yellow, orange, red, black) plus custom color picker
* **Custom Color Picker** - Tap the rainbow gradient button to explore 88+ curated colors in a honeycomb grid
* **Interactive Clear Function** - Drag the trash button down to clear with visual preview
* **Drawing Sounds** - Subtle pencil scratching sounds as you draw
* **PWA Support** - Install to home screen for a full-screen app experience
* **Offline First** - Works without an internet connection
* **Wake Lock** - Screen stays on while drawing
* **Responsive** - Works in both landscape and portrait orientations

## Tech Stack

* **Core Technologies**
  * [**Vanilla JavaScript**](https://developer.mozilla.org/en-US/docs/Web/JavaScript) - No framework overhead, modular ES6 architecture
  * [**HTML5 Canvas**](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Native, performant drawing with optimized rendering
  * [**HTML Dialog Element**](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) - Native modal dialogs with backdrop support
  * [**HTML Details/Summary**](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details) - Collapsible instruction sections

* **Build & PWA**
  * [**Vite**](https://vite.dev/) - Fast build tool with hot module replacement
  * [**vite-plugin-pwa**](https://vite-pwa-org.netlify.app/) - PWA manifest and service worker generation with auto-updates
  * [**vite-plugin-handlebars**](https://github.com/alexlafroscia/vite-plugin-handlebars) - Build-time HTML partials; `index.html` composes from files in `partials/`

* **Audio & Media**
  * [**HTMLAudioElement**](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement) - Native browser audio playback (no library dependency)
  * [**ElevenLabs Sound Effects**](https://elevenlabs.io/app/sound-effects) - AI-generated pencil drawing sounds

* **Design Assets**
  * [**Material Design Icons**](https://fonts.google.com/icons) - SVG icons for UI elements (parent, trash, new page)
  * [**Google Fonts (Quicksand)**](https://fonts.google.com/specimen/Quicksand) - Playful, legible rounded font
  * [**Transparent Textures**](https://www.transparenttextures.com/) - Background paper texture

* **Browser APIs**
  * [**Pointer Events API**](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) - Unified touch/stylus/mouse handling with multi-touch support
  * [**Wake Lock API**](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) - Keeps screen on during drawing
  * [**Service Workers**](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) - Offline functionality and auto-updates
  * [**Display Mode Detection**](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/display-mode) - PWA installation status detection

* Generators
  * <https://realfavicongenerator.net/>
  * <https://www.pwabuilder.com/reportcard?site=https://splotch.art/>
  * <https://metatags.io/?url=https%3A%2F%2Fsplotch.art>



## Getting Started

### Prerequisites

* Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Image Optimization

Convert unoptimized file formats before committing

```bash
node scripts/png-to-webp.mjs
```

## Deployment

### Netlify

This app is optimized for Netlify deployment:

1. Push your code to GitHub
2. Connect your repo to Netlify
3. Netlify will automatically detect the build settings from `netlify.toml`
4. Deploy!

Or use the Netlify CLI:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```


## AI Image Generation

The "AI-ify" feature re-imagines a child's drawing as a polished illustration via the Gemini API. Because this calls a paid model, access is gated behind a token.

* To grant a user access, append one of those tokens to the app URL as the `ai_access_token` query param:

  ```none
  https://splotch.art/?ai_access_token=YOUR_TOKEN
  ```


## License

MIT


## UI Elements

* **Color Palette** - Container bar holding all color swatches
  * **Color Swatch** - Individual circular color selection button
    * **Selection Ring** - Colored ring indicator around the active color swatch
* **Gradient Swatch** - Last color button with rainbow gradient and + symbol; opens custom color picker
  * **Color Picker Overlay** - Full-screen modal with blurred backdrop for selecting custom colors
  * **Hexagon Grid** - Honeycomb pattern of color tiles in the color picker
  * **Color Hexagon** - Individual hexagon-shaped color tile; drag across to explore, lift to select
* **Drawing Canvas** - Main touch-responsive drawing surface
* **Clear Button** - Floating trash button for clearing the canvas
  * **Clear Preview Line** - Torn paper edge visual indicator showing where canvas will be cleared during drag
  * **Clear Accept Zone** - Bottom 15% of screen that turns red; drop Clear Button here to confirm
  * **Page Turn Overlay** - White overlay animation that sweeps across when clearing
* **Actions Panel** - Bottom-corner panel hosting auxiliary controls
  * **Undo Button** - Reverts the last drawing stroke
  * **Screenshot Button** - Saves the current drawing as a PNG (toggle in Parent Center)
  * **Stroke Width Button** - Opens a flyout for selecting line thickness (toggle in Parent Center)
  * **Coloring Book Button** - Opens the Coloring Book Picker (toggle in Parent Center)
* **Coloring Book Picker** - Modal dialog for choosing a coloring page to use as a canvas overlay
  * **Coloring Book Grid** - First menu showing each coloring book by its cover image
  * **Coloring Book Tile** - Individual book cover button; tap to open that book's pages
  * **Coloring Page Grid** - Second menu showing the 6 selectable coloring pages in a book
  * **Coloring Page Tile** - Individual coloring page; tap to apply it as the canvas overlay
  * **Coloring Page Overlay** - Selected page rendered behind the drawing canvas with multiply blend, so white areas blend into the paper background and the line art stays visible
* **Parent Help Button** - Floating button that opens the Parent Center
  * **Parent Center** - Modal with platform install guides and app settings
    * **Install Guide** - iOS / Android tabs with step-by-step PWA setup
    * **Settings** - Tab for app preferences (Drawing Sounds, Save on Delete, Screenshot Button, Stroke Width Control, Coloring Books)


## Timer Debug View

Open it locally: npm run dev <http://localhost:5173/dev/ai-timer>

Watch the tests run headed with `npm run test:headed -- ai-timer

## TODO

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
* [ ] When hitting the AI option without customization enabled, it should also pull up loading spinner when clicked.
* [ ] Full color the controls
* [ ] AI Style icons should use custom image and then generate corresponding output for each.
  * [ ] Currently not a big difference between default and cartoon
* [ ] Add Parent Center button to Auto-save AI generated images toggle. If enabled, there no longer needs to be a Download button and you can use the extra real estate to show a bigger picture. Should auto
* [ ] AI Style icon that allows for manual text input to customize prompt. does not need to also respect style selection
* [ ] Auto save AI generated images toggle. No longer need download button
* [ ] Fun loading sound while AI is loading
* [ ] Hand draw icons
* [ ] Admin Center to provide access codes
* [ ] Maybe add route to confirm access token as well?
* [ ] BYO Key?
* [ ] Figure out what happened to progressive disclosure of top colors
* [ ] Increase default timer
* [ ] Increase size of pulsations when overtime
* [ ] Start adding crazier and crazier animations if time goes super long
* [ ] If call fails and you need to try again, enable a way to do so immediately
* [ ] AI option without customization should also pull up loading spinner
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
* [ ] Bugs
  * [ ] Make sure we can refresh PWA
  * [ ] It takes about 10s on ios for the pencil sounds to come in
  * [ ] Sometimes it doesn't register clicks on color changes
* [ ] Controls
  * [ ] Brush type (blend mode with previous drawing)


## Coloring Book Sections

### Outer space

* Rocket ship
* Astronaut
* The moon and stars
* Space Station
* Meteor shower
* Rover on mars

## Mythical & Magical Creatures

* Unicorn
* Friendly Dragon
* Mermaid
* Pegasus
* Forest Fairy
* Wizard's Owl
