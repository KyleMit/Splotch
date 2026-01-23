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
* **Version Badge** - Timestamp display in bottom right (toggle with 5 taps)

## Tech Stack

* **Core Technologies**
  * [**Vanilla JavaScript**](https://developer.mozilla.org/en-US/docs/Web/JavaScript) - No framework overhead, modular ES6 architecture
  * [**HTML5 Canvas**](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Native, performant drawing with optimized rendering
  * [**HTML Dialog Element**](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) - Native modal dialogs with backdrop support
  * [**HTML Details/Summary**](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details) - Collapsible instruction sections

* **Build & PWA**
  * [**Vite**](https://vite.dev/) - Fast build tool with hot module replacement
  * [**vite-plugin-pwa**](https://vite-pwa-org.netlify.app/) - PWA manifest and service worker generation with auto-updates

* **Audio & Media**
  * [**Howler.js**](https://howlerjs.com/) - Audio playback with speed-based pause/resume
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

## Project Structure

```none
/
├── public/                  # Static assets
│   ├── filters/             # SVG filters for progressive enhancement
│   │   └── torn-edge.svg    # Torn paper edge filter (non-iOS)
│   ├── sounds/              # Audio files
│   ├── icons/               # Icons and images
│   │   └── handmade-paper.png # Paper texture background
│   └── ...                  # Manifest, etc.
├── src/                     # Source code
│   ├── main.js              # App initialization and orchestration
│   ├── drawingCanvas.js     # Canvas drawing logic
│   ├── colorPalette.js      # Color swatch UI and responsive layout
│   ├── colorPicker.js       # Custom color picker modal
│   ├── clearCanvas.js       # Clear button drag interaction
│   ├── deviceEnhancements.js # Progressive SVG enhancement (Android/Desktop)
│   ├── version.js           # Version badge display
│   ├── pwaUpdate.js         # PWA automatic update management
│   └── style.css            # All styles
├── index.html               # Entry point
└── vite.config.js           # Build configuration
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

See `src/deviceEnhancements.js` for the progressive enhancement logic and `public/filters/` for SVG filter definitions.

## Features Explained

### Drawing Engine

Uses HTML5 Canvas with Pointer Events for smooth, responsive drawing across all input types (touch, stylus, mouse).

### Audio System

Howler.js provides:

* Audio sprites for efficient loading
* Overlapping sound playback
* Automatic mobile audio unlock
* Throttled playback to prevent audio chaos

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

## Credits

Built for toddlers who love to create! 🎨✨

## TODO

* [ ] Add "color book" style picker with background overlay
* [ ] Make sure we can refresh PWA
* [ ] It takes about 10s on ios for the pencil sounds to come in
* [ ] Paper edge filter could be smoother and not applying correctly on android
* [ ] Refactor to use drag and drop API (doesn't work on mobile)
* [ ] Controls?
  * [x] Undo
  * [ ] Eraser or at least white color in color palette
  * [ ] Stoke width
  * [ ] Brush type
