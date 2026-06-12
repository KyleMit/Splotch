# android/ — Capacitor Android project

* `app/src/main/assets/public/` is **generated** — `cap sync` copies it from `build/`. Never hand-edit it; change the web source and re-sync. Gradle files, `AndroidManifest.xml`, and `res/` are owned and editable.
* Builds require Node ≥ 22 and a **full JDK 21** on `JAVA_HOME` (ADR-0012). A JetBrains JBR will fail AGP's `JdkImageTransform`.
* The npm `android:*` scripts invoke `.\gradlew` and are Windows-oriented. On macOS run Gradle directly (`cd android && ./gradlew :app:installDebug`) or use `npx cap run android`.
* Release signing reads `android/keystore.properties` (git-ignored; template at `keystore.properties.example`). Values must not be quoted. Without the file, `bundleRelease` produces an unsigned AAB.
* Don't hand-edit `versionCode`/`versionName` in `app/build.gradle` — `npm run release` sets them via `capacitor-set-version`.
* Full toolchain setup, device workflows, and the store release checklist: `mobile` skill.
