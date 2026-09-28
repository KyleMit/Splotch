import { capture } from '../../../lib/proc.mjs';
import { rethrowIfBroken } from '../../lib/error-classification.mjs';

// Spoken on the Mac with `say`, for a person drawing on a device held away from
// the terminal. Best effort: a Mac with no speech voice does not lose the
// capture a person is already holding the device for.
export function speak(words, exec = capture) {
  try {
    exec('say', [words]);
  } catch (error) {
    rethrowIfBroken(error);
    // The terminal countdown still runs.
  }
}
