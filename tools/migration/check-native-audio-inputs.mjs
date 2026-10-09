import { ROOT, isMain, runMain } from '../lib/proc.mjs';
import { qualifyAudioInputs } from './lib/native-audio-qualification.mjs';
if (isMain(import.meta.url))
  runMain(async () => {
    const { lock: _lock, ...result } = qualifyAudioInputs(ROOT);
    console.log(JSON.stringify(result, null, 2));
  });
