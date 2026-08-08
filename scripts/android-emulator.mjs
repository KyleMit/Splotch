import { AVD_NAME } from './lib/android.mjs';
import { fail, run } from './lib/proc.mjs';

const operation = process.argv[2];

switch (operation) {
  case 'boot':
    run('emulator', ['-avd', AVD_NAME]);
    break;
  case 'emulator':
    run('npm', ['run', 'cap:sync']);
    run('cap', ['run', 'android', '--flavor', 'generic', '--target', AVD_NAME]);
    break;
  case 'live':
    run('cap', [
      'run',
      'android',
      '--flavor',
      'generic',
      '--target',
      AVD_NAME,
      '--live-reload',
      '--port',
      '5173',
    ]);
    break;
  default:
    fail(`Unknown Android emulator operation: ${operation}`);
}
