// Runs the Android Gradle wrapper (ADR-0017). Resolving the wrapper to an
// absolute path and spawning it from android/ keeps the npm scripts free of an
// inline `cd android && ./gradlew` shell dance. Forwards its arguments (the
// Gradle tasks) and exit code. Used by
// android:apk / android:run / android:bundle / android:clean.

import { run, fail } from '../../lib/proc.mjs';
import { ANDROID_DIR, GRADLEW } from './lib/android-toolchain.mjs';

const tasks = process.argv.slice(2);
if (tasks.length === 0)
  fail(
    '[run-gradle] no Gradle task given — e.g. node tools/mobile/android/run-gradle.mjs :app:bundleRelease'
  );

run(GRADLEW, tasks, { cwd: ANDROID_DIR });
