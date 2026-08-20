# ElevenLabs sound effects

This capability wraps only ElevenLabs' `POST /v1/sound-generation` endpoint. It intentionally does
not call models, account, voice, history, or other endpoints, so it works with an API key restricted
to Sound Effects.

The wrapper owns request validation, sound-effects-only model and format constraints, structured API
errors, `Retry-After` plus exponential backoff for 429/5xx responses, and the binary response. The
CLI adds restart-safe batch output and gitignored secret discovery. It never makes a live API call
in the test suite.

## Setup

Set the key in the shell or in a gitignored `.env.local`, `.env`, or `web/.env` file:

```dotenv
ELEVENLABS_API_KEY=your-key-here
```

Keep the key in local development tooling. Never import this capability into browser code.

## One sound effect

Choose a fixed duration explicitly:

```sh
npm run gen:sound-effect -- \
  --text "One-shot soft cartoon soap-bubble pop, warm, round, close and dry, no voice or reverb." \
  --duration 0.5 \
  --influence 0.7 \
  --out /tmp/bubble-pop.mp3
```

Or deliberately let ElevenLabs choose the duration:

```sh
npm run gen:sound-effect -- \
  --text "Steady gentle rain ambience, seamless and consistent" \
  --auto-duration \
  --loop \
  --out /tmp/rain.mp3
```

Without `--out` or `--out-dir`, the CLI creates a new temporary directory and prints `OUTPUT_DIR`.
Use `--dry-run` to validate and print the complete plan without reading a key or making a request.

## Batch generation

Pass either a JSON array or an object with `defaults` and `candidates`. Every candidate needs a
relative output `file`, a `text` prompt, and an explicit `durationSeconds`: a number from 0.5 to 30,
or `null` for automatic duration.

```json
{
  "defaults": {
    "durationSeconds": 0.5,
    "loop": false,
    "promptInfluence": 0.7,
    "outputFormat": "mp3_44100_128"
  },
  "candidates": [
    {
      "file": "bubble-pop.mp3",
      "text": "One-shot soft cartoon soap-bubble pop, warm, round, close and dry, no voice or reverb."
    },
    {
      "file": "plush-boop.mp3",
      "text": "One-shot gentle plush-toy boop, muted, cheerful, close and dry, no voice or melody."
    }
  ]
}
```

```sh
npm run gen:sound-effect -- --input candidates.json --out-dir /tmp/sfx
```

The CLI validates the entire batch before reading the API key. It then runs candidates sequentially,
writes every success immediately, continues after per-file failures, and reports all failures at the
end. Existing files are skipped, which makes the same command the resume operation after a rate
limit. `--overwrite` is the explicit opt-in to regenerate and atomically replace them.

## Request surface

The importable wrapper is `lib/sound-effects-client.mjs`:

```js
import { ElevenLabsSoundEffectsClient } from './tools/elevenlabs/lib/sound-effects-client.mjs';

const client = new ElevenLabsSoundEffectsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const { bytes } = await client.generateSoundEffect({
  text: 'One-shot warm wooden toy click, soft and child-friendly',
  durationSeconds: 0.5,
  loop: false,
  promptInfluence: 0.7,
});
```

The current endpoint model is `eleven_text_to_sound_v2`. The CLI defaults to `mp3_44100_128` and
accepts the 21 output formats in ElevenLabs' current OpenAPI schema: MP3, raw PCM, Opus, μ-law, and
A-law variants. File extensions must match the chosen codec (`.mp3`, `.pcm`, `.opus`, `.ulaw`, or
`.alaw`). PCM responses are raw PCM, not WAV containers.

## Prompt and API guidance

ElevenLabs recommends clear descriptions and understands audio terms such as `one-shot`, `loop`,
`impact`, `whoosh`, `ambience`, `stem`, `glitch`, and `drone`. For a compound sequence, describe the
order of events; for cleaner editing, generating its individual effects separately is often easier.
Higher prompt influence is more literal and less variable.

The API reference currently gives fixed duration as 0.5–30 seconds and prompt influence as 0–1. A
fixed duration and automatic duration have different credit pricing, so the CLI requires that choice
to be explicit. Consult the current pricing page before a large batch.

* [Create sound effect API reference](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
* [Sound-effects overview and prompting guide](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
* [API errors and rate limiting](https://elevenlabs.io/docs/eleven-api/resources/errors)
* [Sound-effects pricing](https://elevenlabs.io/docs/help-center/product/content-production/sound-effects/how-much-does-it-cost-to-generate-sound-effects)

## Maintenance

When ElevenLabs changes the sound-generation schema, update the closed `SOUND_EFFECT_MODEL` and
`OUTPUT_FORMATS` declarations in `lib/sound-effects-client.mjs`, the CLI extension mapping, and the
mocked request tests together. The ElevenLabs OpenAPI document is the source of truth for endpoint
enums; the overview is the source for prompting guidance.
