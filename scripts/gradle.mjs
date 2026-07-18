// Runs the Android Gradle wrapper (ADR-0017). Resolving the wrapper to an
// absolute path and spawning it from android/ keeps the npm scripts free of an
// inline `cd android && ./gradlew` shell dance. Forwards its arguments (the
// Gradle tasks) and exit code. Used by
// android:apk / android:run / android:bundle / android:clean.

import { join } from 'node:path';
import { ROOT, run, fail } from './lib/utils.mjs';

const tasks = process.argv.slice(2);
if (tasks.length === 0)
  fail('[gradle] no Gradle task given — e.g. node scripts/gradle.mjs :app:bundleRelease');

const androidDir = join(ROOT, 'android');
const gradlew = join(androidDir, 'gradlew');

run(gradlew, tasks, { cwd: androidDir });
