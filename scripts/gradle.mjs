// Runs the Android Gradle wrapper from android/ and forwards its task arguments.
// Used by android:apk / android:run / android:bundle / android:clean.

import { join } from 'node:path';
import { ROOT, run, fail } from './lib/utils.mjs';

const tasks = process.argv.slice(2);
if (tasks.length === 0)
  fail('[gradle] no Gradle task given — e.g. node scripts/gradle.mjs :app:bundleRelease');

const androidDir = join(ROOT, 'android');
run(join(androidDir, 'gradlew'), tasks, { cwd: androidDir });
