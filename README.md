# Splotch 🎨

A simple, delightful drawing app designed for toddlers (2+ years old). Features large touch targets, cheerful colors, and subtle drawing sounds to create an engaging creative experience.

## Features

- **Simple Drawing Interface** - Just touch and draw with your finger or Apple Pencil
- **Kid-Friendly Color Picker** - Large, colorful buttons on the left side
- **Easy Clear Function** - Slide the trash can to start fresh
- **Drawing Sounds** - Subtle pencil scratching sounds as you draw
- **Sound Toggle** - Parents can mute sounds with the speaker button
- **PWA Support** - Install to home screen for a full-screen app experience
- **Offline First** - Works without an internet connection
- **Wake Lock** - Screen stays on while drawing
- **Responsive** - Works in both landscape and portrait orientations

## Tech Stack

- **Vite** - Fast build tool and dev server
- **Vanilla JavaScript** - No framework overhead
- **HTML5 Canvas** - Native, performant drawing
- **Pointer Events API** - Unified touch/stylus/mouse handling
- **Howler.js** - Audio playback with sprite support
- **vite-plugin-pwa** - PWA manifest and service worker generation

## Getting Started

### Prerequisites

- Node.js 18+ and npm

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

### 2. App Icons

You need to create icons for the PWA to be installable:

- `public/icon-192.png` (192x192)
- `public/icon-512.png` (512x512)
- `public/apple-touch-icon.png` (180x180)
- `public/favicon.ico` (32x32)

See `public/ICONS-README.md` for icon creation guidance.

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

### Other Platforms

The app will work on any static hosting platform:

- **Vercel**: Auto-detects Vite
- **GitHub Pages**: Build and push `dist/` folder
- **Cloudflare Pages**: Connect repo and deploy

## Browser Support

- Chrome/Edge 88+
- Safari 15.4+
- Firefox 98+
- iOS Safari 15.4+

## Features Explained

### Drawing Engine
Uses HTML5 Canvas with Pointer Events for smooth, responsive drawing across all input types (touch, stylus, mouse).

### Audio System
Howler.js provides:
- Audio sprites for efficient loading
- Overlapping sound playback
- Automatic mobile audio unlock
- Throttled playback to prevent audio chaos

### PWA Capabilities
- Installable to home screen
- Offline functionality
- Full-screen mode on mobile
- Screen wake lock prevents sleep

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
