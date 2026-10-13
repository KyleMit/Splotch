# Migration tools

Tooling for the React Native app in `experiments/native-architecture` while it migrates toward
replacing the Capacitor shell (epic 2690). It changes no shipping web or Capacitor build.

## Entry points

* `check:migration:native-candidate` validates the maintained Android/iOS source set against the
  Expo bare-minimum template provenance and the source contracts in `lib/`. It performs no native
  build. Quality runs it. It also authenticates the manually maintained candidate `Gemfile` through
  `lib/native-gemfile.mjs`.
* `gen:migration:native-candidate -- --archive=<template.tgz>` derives candidate-only native sources
  from one explicit template archive. It refuses maintained edits and never runs in CI.
* `gen-offline-catalog.mjs` generates the native offline coloring-book catalog
  (`experiments/native-architecture/src/offlineLibrary/books.generated.ts`).
* `check:migration:rsd-drawing-tokens` checks the react-strict-dom drawing screen's token projection
  against the shared design owner.
* `test:migration:rsd-selection` runs the RSD drawing-screen tests through the released native
  renderer (`rsd-drawing-vitest.config.mjs`). They are excluded from `test:tools` because they need
  the native `react-strict-dom` alias.
* `verify-drawing-dev.mjs` drives the browser preview and saves a painted PNG for a quick visual
  check.

## Layout

* `lib/` holds the source-contract, template and source-extension owners those entry points and the
  native tests in `tools/tests/` import.
* `tests/` holds this capability's tests; the React Native product tests live in `tools/tests/`.
* `inputs/` holds the template metadata and the reviewed source-extension manifests.
* `probes/native-eraser/` is the browser checkpoint driver the eraser composition tests import.
