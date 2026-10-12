import { tryCapture } from '../../../lib/proc.mjs';

// Spoken on the Mac with `say`, for a person drawing on a device held away from
// the terminal. Best effort: a Mac with no speech voice does not lose the
// capture a person is already holding the device for, so a failed `say` is
// ignored and the terminal countdown still runs.
export function speak(words) {
  tryCapture('say', [words]);
}
