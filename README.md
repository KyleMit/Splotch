# Splotch 🎨

A simple, delightful drawing app designed for toddlers (2+ years old). Features large touch targets, cheerful colors, and subtle drawing sounds to create an engaging creative experience.

## Features

* **Simple Drawing Interface** - Just touch and draw with your finger or Apple Pencil
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
  * **Clear Preview Line** - Visual indicator showing where canvas will be cleared during drag
  * **Clear Accept Zone** - Bottom 15% of screen that turns red; drop Clear Button here to confirm
  * **Page Turn Overlay** - White overlay animation that sweeps across when clearing
* **Version Badge** - Timestamp display in bottom right (toggle with 5 taps)

## Tech Stack

* **Vite** - Fast build tool and dev server
* **Vanilla JavaScript** - No framework overhead
* **HTML5 Canvas** - Native, performant drawing
* **Pointer Events API** - Unified touch/stylus/mouse handling
* **Howler.js** - Audio playback with sprite support
* **vite-plugin-pwa** - PWA manifest and service worker generation

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

## Setup Requirements

### 1. Audio Files

You need to add a pencil drawing sound file:

1. Create or download a pencil scratching sound
2. Place it at `public/sounds/pencil.mp3`
3. The file should be ~300ms with 3 short sound variations

See `public/sounds/README.md` for detailed instructions on creating/finding audio files.

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

## Customization

### Colors

Edit the color palette in `index.html`:

```html
<button class="color-btn" data-color="#YOUR_COLOR" style="background-color: #YOUR_COLOR;"></button>
```

### Brush Size

Adjust in `main.js`:

```javascript
ctx.lineWidth = 8; // Change this value
```

### Sound Volume

Adjust in `main.js`:

```javascript
volume: 0.3 // 0.0 to 1.0
```

## License

MIT

## Credits

Built for toddlers who love to create! 🎨✨

## TODO

* [ ] Add pencil sound
* [x] Add gradient picker option
  * [x] interlace hexagons
  * [ ] get rid of white ring
  * [x] make sure it's always visible
* [ ] Add "color book" style picker with background overlay
* [ ] Make sure [installable](https://www.pwabuilder.com/reportcard?site=https://splotchy.netlify.app/)
* [ ] Add PWA help guide for parents
  * [ ] Boring grey parent logo in the bottom
* [ ] Make clear line a crinkle
* [ ] Make sure we can refresh PWA
