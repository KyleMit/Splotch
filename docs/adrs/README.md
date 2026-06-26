# Architectural Decision Records

This directory records significant architectural decisions made in the Splotch project. Each ADR documents the context, the decision, and the consequences so future contributors understand *why* things are the way they are.

| # | Title | Status |
|---|-------|--------|
| [0001](0001-sveltekit-dual-adapter-strategy.md) | SvelteKit Dual-Adapter Strategy (Web + Native) | Active |
| [0002](0002-svelte-5-runes.md) | Svelte 5 Runes Over Legacy Stores | Active |
| [0003](0003-typescript-migration.md) | Full TypeScript Adoption | Active |
| [0004](0004-imperative-canvas-engine.md) | Imperative Canvas Engine with Callback Interface | Active |
| [0005](0005-dual-layer-storage.md) | Dual-Layer Storage (localStorage + Capacitor Preferences) | Active |
| [0006](0006-server-side-ai-generation.md) | Server-Side AI Image Generation via Netlify Serverless Function | Active |
| [0007](0007-cors-csrf-for-native-api-calls.md) | CORS and CSRF Strategy for Native-to-Web API Calls | Active |
| [0008](0008-three-tier-testing-strategy.md) | Three-Tier Testing Strategy (Vitest + Playwright + Maestro) | Active |
| [0009](0009-happy-dom-over-jsdom.md) | happy-dom Over jsdom for Vitest Unit Tests | Active |
| [0010](0010-compile-time-build-constants.md) | Compile-Time Build Constants via Vite Define | Active |
| [0011](0011-capacitor-cli-windows-patch.md) | patch-package for Capacitor CLI Windows gradlew Bug | Active |
| [0012](0012-android-build-toolchain.md) | Android Build Toolchain Requirements (Node 22 + JDK 21 Temurin) | Active |
| [0013](0013-platform-detection-without-capacitor-core.md) | Platform Detection Without Importing @capacitor/core | Active |
| [0014](0014-in-memory-rate-limiting.md) | In-Memory Rate Limiting (Per-Instance Sliding Window) | Active |
| [0015](0015-capped-dpr-canvas-rendering.md) | Capped-DPR Canvas Rendering (min(devicePixelRatio, 2)) | Active |
| [0016](0016-admin-console-bearer-api-for-native.md) | Admin Console via Shared Server Core + Bearer-Session API for Native | Active |
| [0017](0017-cross-platform-node-scripts.md) | Cross-Platform Node Scripts with Shared Helpers in scripts/lib/ | Active |
| [0018](0018-claude-native-knowledge-tiers.md) | Project Knowledge in Claude Code-Native Tiers (Skills, Rules, Nested CLAUDE.md) | Active |
| [0019](0019-npm-script-naming-and-scripts-info.md) | npm Script Naming Conventions + scripts-info Self-Documentation | Active |
| [0020](0020-ios-build-toolchain.md) | iOS Build Toolchain (Swift Package Manager, xcodebuild Scripts, Automatic Signing) | Active |
| [0021](0021-cloud-session-tunneling.md) | Tunneling the Dev Server from Claude Code Cloud Sessions (self-hosted chisel reverse tunnel) | Active |
| [0022](0022-pwa-service-worker-strategy.md) | PWA Service Worker Strategy — vite-plugin-pwa as Manifest Injector with Custom Update Lifecycle | Active |
| [0023](0023-redteam-ai-safety-integration-test.md) | Red-Team Integration Test for AI Image Safety (Manual, Token-Gated, Encrypted Fixtures, Excluded from CI) | Active |
| [0024](0024-web-app-subdirectory-for-netlify-watcher.md) | Web App in web/ Subdirectory to Scope the Netlify Dev Watcher | Active |
| [0025](0025-netlify-blobs-server-storage.md) | Netlify Blobs for Server-Side Storage (Eventual Consistency, Env-Seeded Fallback) | Active |
| [0026](0026-notch-band-via-safe-area-css.md) | Notch Band via a Safe-Area CSS Strip, Not Per-Platform Native Status Bars | Active |
| [0027](0027-device-lock-detection-plugin.md) | A Custom `DeviceLock` Capacitor Plugin to Detect Guided Access / App Pinning | Active |
| [0028](0028-apple-pencil-eraser-plugin.md) | A Custom `PencilEraser` Capacitor Plugin for the Apple Pencil Double-Tap | Active |
| [0029](0029-npm-as-package-manager.md) | npm as the Package Manager | Active |
| [0030](0030-git-derived-web-version.md) | Git-Derived Per-Commit Web Version (major.minor.commits-since-tag) | Active |
| [0031](0031-linting-formatting-and-ci-quality-gates.md) | Linting, Formatting, and CI Quality Gates (ESLint + Prettier, critical-only audit) | Active |
| [0032](0032-performance-profiling-harness.md) | Automated Performance Profiling Harness (build-flag marks + CDP/WebKit capture, web + Android + iOS) | Active |
