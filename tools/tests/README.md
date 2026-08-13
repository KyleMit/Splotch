# Root tool tests

This directory tests flat repository-wide tools, shared libraries, and cross-capability invariants.
Capability-owned tests live beside their implementation under `tools/<capability>/tests/`.

Run the suite from the repository root:

```sh
npm run test:tools
```

Use a relative file filter for a focused run:

```sh
npm run test:tools -- tests/run-quality-checks.test.mjs
```

The suite is local and deterministic except for tests that deliberately launch a loopback server.
Those tests own and release the server they create; an occupied port is never permission to stop an
unrelated listener. A failing drift guard should be fixed at the source it compares rather than by
loosening the assertion. When a root tool is renamed, rename its matching test and update mocks,
fixture paths, script metadata, and both reference guards in the same commit.
