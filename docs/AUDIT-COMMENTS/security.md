# Audit comments — Security

2 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see the
README for what this archive is, the full run table, and the category index.

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 6666d7801fd5 — [P1][security] Test/deploy/smoke workflows declare no `permissions:` block — they run with the default (write-capable) token

**Issue**

`pages.yml` (18-22), `label-sync.yml` (17-18), and `label-to-todo.yml` (9-10) each scope their
`GITHUB_TOKEN` with an explicit `permissions:` block. The four remaining workflows — `test.yml`,
`android-deploy.yml`, `ios-deploy.yml`, `blobs-smoke.yml` — declare **none**, so they inherit the
repository/org default, which for many repos is the legacy read-write token. These workflows run
untrusted PR code (`test.yml` triggers on `pull_request`), download and execute a piped installer
(`curl … | bash` for Maestro), and handle `secrets.ADMIN_ACCESS_TOKEN` (`blobs-smoke.yml`). A
compromised dependency or action step would have write access to contents, issues, and more.

**Fix**

Added workflow-level `contents: read` permissions to all four scoped GitHub Actions workflows,
preventing their `GITHUB_TOKEN` from inheriting broader repository or organization defaults.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097382786) · 2026-07-27
22:13:47 UTC</sub>

### 8f8e66a9ab98 — [P3][security] Third-party actions are pinned to mutable major tags, not commit SHAs

**Issue**

All actions — first-party (`actions/checkout@v7`, `actions/setup-node@v6`, `actions/cache@v6`,
`actions/upload-artifact@v7`) and third-party (`reactivecircus/android-emulator-runner@v2`,
`crazy-max/ghaction-github-labeler@v5`) — are pinned to floating major-version tags. A tag is
mutable: a compromised or repointed tag executes new code in CI with the workflow's token (see the
missing-`permissions` finding for how much that token can do). Third-party actions like the
emulator-runner and the labeler are the higher-risk cases.

**Fix**

Pinned all 16 external GitHub Action uses across seven workflows to immutable SHAs for their
existing releases, with semantic-version comments for maintenance. Local composite actions and
workflow behavior remain unchanged.

*Revised before approval:* Pinned the two composite-action dependencies missed in the first pass:
setup-node v6.5.0 and upload-artifact v7.0.1 now use immutable commit references with version
comments. This closes the remaining mutable external action paths while preserving composite
behavior.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Pin the remaining external actions in `.github/actions/setup-node/action.yml:17`
  (`actions/setup-node@v6`) and `.github/actions/upload-maestro-report/action.yml:13`
  (`actions/upload-artifact@v7`) to full commit SHAs with version comments; these composite-action
  references still execute mutable major tags.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097814274) · 2026-07-27
23:06:11 UTC</sub>
