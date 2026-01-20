# Icons Needed for Splotch PWA

To make the app installable as a PWA, you need to create the following icon files:

## Required Files

1. `icon-192.png` - 192x192 PNG icon
2. `icon-512.png` - 512x512 PNG icon
3. `apple-touch-icon.png` - 180x180 PNG icon (for iOS)
4. `favicon.ico` - 32x32 favicon

## Design Suggestions

The icon should be:
- Bright and colorful (appealing to toddlers)
- Simple and recognizable
- Feature drawing/art theme (crayon, paintbrush, paint splotch, etc.)

## Quick Creation Options

### Option 1: Canva
1. Go to [Canva](https://canva.com)
2. Create a 512x512 design
3. Use a colorful splotch or crayon graphic
4. Add "Splotch" text
5. Export as PNG and resize for different sizes

### Option 2: Figma/Sketch
Design your icon and export in multiple sizes

### Option 3: AI Generation
Use DALL-E, Midjourney, or similar to generate:
"Colorful paint splotch icon for kids drawing app, simple, bright colors, flat design"

### Option 4: Simple Placeholder
Create a simple colored square with an "S" for now:
```bash
# Using ImageMagick
convert -size 512x512 xc:#FF6B6B -pointsize 300 -fill white -gravity center -annotate +0+0 'S' icon-512.png
convert icon-512.png -resize 192x192 icon-192.png
convert icon-512.png -resize 180x180 apple-touch-icon.png
convert icon-512.png -resize 32x32 favicon.ico
```

## Recommended Colors

Use the same palette as the app:
- Red: #FF6B6B
- Cyan: #4ECDC4
- Yellow: #FFE66D
- Purple: #AA96DA
