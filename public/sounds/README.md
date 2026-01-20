# Audio Files for Splotch

This directory should contain the pencil drawing sound effects.

## Required File

- `pencil.mp3` - A 300ms audio file containing 3 short pencil scratch sounds (each ~100ms)

## How to Create the Audio

You have several options:

### Option 1: Free Sound Effects
Visit [freesound.org](https://freesound.org) and search for "pencil scratch" or "pencil writing". Download 3 short variations and combine them into a single file.

### Option 2: Record Your Own
1. Use your phone to record the sound of a pencil on paper
2. Record 3 different short scratches
3. Combine them in an audio editor like Audacity
4. Export as MP3

### Option 3: AI-Generated
Use a service like [ElevenLabs Sound Effects](https://elevenlabs.io) to generate "pencil scratching on paper" sounds.

### Option 4: Placeholder Silence
For development, you can create a silent MP3:
```bash
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.3 -q:a 9 -acodec libmp3lame pencil.mp3
```

## Audio Sprite Format

The app expects the audio file to work as a sprite with these timings:
- `draw1`: 0-100ms
- `draw2`: 100-200ms
- `draw3`: 200-300ms

Each segment should be a short, subtle pencil scratch sound that won't be annoying when played repeatedly.
