---
name: mobile
description: Capacitor native app guide — Android/iOS toolchain setup (macOS + Windows), build/sign/run commands, on-device testing, Chrome remote profiling, and the store release & kids-compliance checklists. Use before touching anything Android, iOS, or Capacitor related.
---

# Splotch — Native App (Capacitor) Guide

Splotch ships as native **Android** and **iOS** apps via [Capacitor](https://capacitorjs.com/),
bundling the same SvelteKit code as a static, offline-first shell. The web app (splotch.art) is
unchanged and still deploys to Netlify.

This guide is split into three files — **read the one that matches your task**:

* **[native.md](native.md)** — start here. How the static native build works, offline vs. online
  behavior, dual-layer storage, the data/privacy posture the stores ask about, shared store-listing
  assets, the kids-compliance baseline, and cross-platform follow-ups.
* **[android.md](android.md)** — Android toolchain setup (macOS + Windows), build/sign/run commands,
  on-device web testing, Chrome remote profiling, and the Google Play release + Families-policy
  checklist.
* **[ios.md](ios.md)** — iOS toolchain setup (macOS + Xcode, SPM not CocoaPods), build/run commands,
  Safari Web Inspector, and the App Store release + Kids-Category checklist.

Both platforms are active and committed (`android/`, `ios/`). Android builds on Windows or macOS;
iOS requires macOS + Xcode. The `CAPACITOR=true` build env var is the single signal for all
web-vs-native branching (see the root `CLAUDE.md`).
