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

See the [architecture guide](.claude/skills/architecture/SKILL.md) for the full tech stack, source map, and UI component glossary. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for dev setup, conventions, and the dual-build explained.

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
node tools/asset-gen/png-to-webp.mjs
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

The same codebase ships as native apps via [Capacitor](https://capacitorjs.com/). The native build is a fully static, offline-first export; only the AI button reaches the network (it calls the hosted endpoint). See the [mobile guide](.claude/skills/mobile/SKILL.md) for the full build/workflow guide and the store release checklist.

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


