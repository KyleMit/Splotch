# Splotch – Architecture

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


## Dev Tooling

AI timer debug view: `npm run dev` → <http://localhost:5173/dev/ai-timer>

Watch the tests run headed with `npm run test:headed -- ai-timer`
