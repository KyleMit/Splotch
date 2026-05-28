# Splotch 🎨

A simple, delightful drawing app designed for toddlers (2+ years old). Features large touch targets, cheerful colors, and subtle drawing sounds to create an engaging creative experience.

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
  * https://realfavicongenerator.net/
  * https://www.pwabuilder.com/reportcard?site=https://splotch.art/
  * https://metatags.io/?url=https%3A%2F%2Fsplotch.art

## Project Structure

```none
/
├── src/                     # Vite root — everything served/built lives here
│   ├── index.html           # Entry point (composes partials via {{> name}})
│   ├── scripts/             # JavaScript modules
│   │   ├── main.js          # App initialization and orchestration
│   │   ├── drawingCanvas.js # Canvas drawing logic
│   │   ├── colorPalette.js  # Color swatch UI and responsive layout
│   │   ├── colorPicker.js   # Custom color picker modal
│   │   ├── clearCanvas.js   # Clear button drag interaction
│   │   ├── parentHelp.js    # Parent Center modal + tab switching
│   │   ├── drawingSound.js  # Drawing sound playback + setting
│   │   ├── saveOnDelete.js  # "Save on Delete" setting + PNG export trigger
│   │   ├── deviceEnhancements.js # Progressive SVG enhancement (Android/Desktop)
│   │   ├── pwaUpdate.js     # PWA automatic update management
│   │   └── actionsPanel.js  # Undo button wiring
│   ├── styles/              # Stylesheets
│   │   └── style.css        # All styles
│   ├── partials/            # Build-time HTML partials (vite-plugin-handlebars)
│   │   ├── head-meta.html   # <head> meta tags, OG/Twitter, favicons, fonts
│   │   ├── color-picker-overlay.html # Color Picker Overlay dialog (hexagon grid)
│   │   └── parent-center.html # Parent Help Button + Parent Center modal
│   └── public/              # Static assets served at site root
│       ├── filters/         # SVG filters for progressive enhancement
│       │   └── torn-edge.svg # Torn paper edge filter (non-iOS)
│       ├── sounds/          # Audio files
│       ├── icons/           # Icons and images
│       │   └── handmade-paper.png # Paper texture background
│       └── ...              # Favicons, manifest, etc.
├── dist/                    # Build output (gitignored)
├── netlify.toml             # Netlify deploy config
└── vite.config.js           # Build configuration (root: src, outDir: ../dist)
```

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

## Installing as a PWA

### iOS (iPhone/iPad)

1. Open the app in Safari
2. Tap the Share button (square with arrow pointing up)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" in the top right corner
5. The app will appear on your home screen with the Splotch icon
6. Tap the icon to launch in fullscreen mode

### Android

1. Open the app in Chrome
2. Tap the menu (three dots)
3. Tap "Install app" or "Add to Home screen"
4. Follow the prompts to install

### Desktop (Chrome/Edge)

1. Look for the install icon in the address bar
2. Click it and follow the prompts

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

## Browser Support

* Chrome/Edge 88+
* Safari 15.4+
* Firefox 98+
* iOS Safari 15.4+

## Platform Differences: Android vs iOS

### SVG Filter Rendering

The app uses a **progressive enhancement approach** for visual effects to balance quality and compatibility:

### iOS Safari Limitations

* iOS Safari cannot render external SVG filter references (`url('/filters/torn-edge.svg#filter')`)
* This affects the torn paper edge effect on the clear overlay
* Inline SVG filters work but cause significant performance issues due to constant recalculation

### Solution: CSS-First with Progressive Enhancement

1. **Default (iOS & All Browsers)**: Uses pure CSS approach
   * `clip-path` polygon for torn edge shape on clear overlay
   * `drop-shadow` filters for shadow effects
   * PNG image for paper texture (works universally)
   * Works universally with good performance

2. **Enhanced (Android, Desktop)**: Automatically upgrades to SVG filters
   * Device detection identifies non-iOS browsers
   * External SVG filters provide higher quality torn edge effects on clear overlay
   * Better visual fidelity for the paper tearing animation

### Debug Parameter

Add `?debugIOS` to the URL to force CSS-only mode on any device:

This is useful for:

* Testing iOS appearance on desktop browsers
* Comparing CSS vs SVG rendering quality
* Debugging visual issues across platforms

### Implementation Details

See `src/scripts/deviceEnhancements.js` for the progressive enhancement logic and `src/public/filters/` for SVG filter definitions.

## Features Explained

### Drawing Engine

Uses HTML5 Canvas with Pointer Events for smooth, responsive drawing across all input types (touch, stylus, mouse).

### Audio System

Built on the native `HTMLAudioElement` API — no audio library dependency:

* Three pencil-scratch samples preloaded as `Audio` instances; one is picked at random per stroke
* Looped playback for the duration of a stroke (`loop = true`)
* Speed-aware gating: pauses when pointer movement drops below a threshold, resumes on motion
* Short debounce timer pauses audio shortly after movement stops to avoid mid-stroke cutoffs
* User preference persisted in `localStorage` and can be toggled from the Parent Center settings
* First playback is gesture-initiated (pointer event), satisfying mobile autoplay requirements

### PWA Capabilities

* Installable to home screen
* Offline functionality
* Full-screen mode on mobile
* Screen wake lock prevents sleep
* Automatic updates with periodic checking:
  * Checks for updates every hour while app is running
  * Checks when app becomes visible again
  * Auto-updates and reloads when new version found
  * Works offline (update checks fail silently)

## License

MIT


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
* [ ] Add "color book" style picker with background overlay
  * [x] For the breadcrumb menu navigation, use the chevron-back.svg
  * [x] Make sure white backgrounds become transparent
  * [x] Make sure background works with screenshot feature
  * [ ] Make sure background works horizontally and vertically
  * [ ] Make sure book selection screen is scrollable.
  * [ ] Come up with other book selections
  * [ ] Pages should be able to be favorited. First book should be favorites
  * [ ] Delete should wipe the page (or first book should be to clear the background)
* [ ] Increase size of line thickness pop-up
* [ ] Make sure SVGs are handled efficiently.  Inline if possible.
* [ ] Separate out parent center buttons into settings / controls
* [ ] Polaroid screenshot should be shape of canvas, maybe also add polaroid frame
* [ ] Parent center control to increase button size
* [ ] Make control-z on desktop also perform an undo action
* [ ] Make the secrets part of the env variable too (right now, they're public in git)
* [ ] Svelte migration
  * [ ] review events / handlers
  * [ ] move CSS into components
* [ ] Refactor to use drag and drop API (doesn't work on mobile - polyfill?)
* [ ] Efficiently pick colors on small devices
* [ ] Bugs
  * [ ] Make sure we can refresh PWA
  * [ ] It takes about 10s on ios for the pencil sounds to come in
  * [ ] Sometimes it doesn't register clicks on color changes
* [ ] Controls
  * [ ] Eraser (/eraser branch)
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

