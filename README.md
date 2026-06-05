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

### Native Apps (Android & iOS)

The same codebase ships as native apps via [Capacitor](https://capacitorjs.com/). The native build is a fully static, offline-first export; only the AI button reaches the network (it calls the hosted endpoint). See [`MOBILE.md`](./MOBILE.md) for the full build/workflow guide and the store release checklist.

```bash
npm run cap:sync       # static build + copy into the native projects
npm run cap:android    # also open the Android project in Android Studio
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
