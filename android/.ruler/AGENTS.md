# android/ - Capacitor Android Project

* `app/src/main/assets/public/` is **generated**. `cap sync` copies it from `build/`.
  Never hand-edit it; change the web source and re-sync. Gradle files,
  `AndroidManifest.xml`, and `res/` are owned and editable.
* Builds require Node >= 22 and a **full JDK 21** on `JAVA_HOME` (ADR-0012). A JetBrains JBR
  will fail AGP's `JdkImageTransform`.
* The npm `android:*` scripts run the Gradle wrapper via `scripts/gradle.mjs`, which picks
  `gradlew.bat` or `./gradlew` per platform (ADR-0017), so they work the same on macOS,
  Linux, and Windows. `npx cap run android` also works.
* Release signing reads `android/keystore.properties` (git-ignored; template at
  `keystore.properties.example`). Values must not be quoted. Without the file,
  `bundleRelease` produces an unsigned AAB.
* Do not hand-edit `versionCode` or `versionName` in `app/build.gradle`; `npm run release`
  sets them via `capacitor-set-version`.
* Full toolchain setup, device workflows, and the store release checklist live in the
  `mobile` skill.
