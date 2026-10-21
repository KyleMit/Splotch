import { AVD_NAME } from './lib/android-toolchain.mjs';
import { run } from '../../lib/proc.mjs';

run('emulator', ['-avd', AVD_NAME]);
