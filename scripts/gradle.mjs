// Runs the Android Gradle wrapper cross-platform (ADR-0017). The npm scripts
// can't invoke the wrapper inline: Windows cmd.exe needs `.\gradlew.bat` (and
// the dev machine's NoDefaultCurrentDirectoryInExePath=1 forces the explicit
// `.\`), while macOS/Linux need `./gradlew`. Resolving the wrapper to an
// absolute path and spawning it from android/ works on every platform.
// Forwards its arguments (the Gradle tasks) and exit code. Used by
// android:apk / android:run / android:bundle / android:clean.

import { join } from 'node:path';
import { ROOT, isWindows, run, fail } from './lib/utils.mjs';

const tasks = process.argv.slice(2);
if (tasks.length === 0) fail('[gradle] no Gradle task given — e.g. node scripts/gradle.mjs :app:bundleRelease');

const androidDir = join(ROOT, 'android');
const gradlew = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');

run(gradlew, tasks, { cwd: androidDir });
