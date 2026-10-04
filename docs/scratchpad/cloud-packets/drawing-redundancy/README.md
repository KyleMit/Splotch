# Drawing redundancy review: no justified deletion

On October 3, 2026, the original cloud result was recovered for preservation as a closed evidence
PR. The returned `report.json` and `manifest.sha256` are retained byte-for-byte. The originally
claimed report commit could not be resolved in the local repository or on GitHub; the returned
documentation was recovered independently of that claim.

The reviewed base is af31a00d11cee749f7cbc24bd61035970453aca5. The scope owns only
`crayonPassBuffer.ts`, `crayonPassBoundaries.ts`, and `tiledRenderer.ts`. Treatment is **NONE**: no
active operation was demonstrated to be redundant while preserving pixels, alpha, pass seeds,
retained history, and every target mode. This is a scoped proof failure, not a claim that
optimization is impossible.

Restamp already omits a closing stamp; its per-op clear, under restore, and glaze recompute
overlapping pixels. Plane mirroring already copies the produced buffer instead of painting its
pattern again. Native flush and clean-tile paths already skip deposition work. Shadow scheduling
coalesces work while retaining the required refresh, and live rendering and history recording have
distinct effects. The report records the inspected contracts and the relevant ADRs.

Preservation verification compared all nine manifest entries with the returned report or exact-base
Git bytes: report, three owned sources, and five ADRs all matched. The report SHA-256 is
`fd48ef2b296b14b7e49f2e9ec44b8868d439db9c38d12b1bf55092494dc61582`; the manifest SHA-256 is
`0c09ba39119fddd0fa53ddeef5a1b8975217ac5556f1e438dc3041fabe53efee`. Both recovered files also match
the added bytes in the returned documentation diff.

The original report records 25 unit tests passing across four files. Those tests use canvas test
contexts and establish orchestration contracts. The browser-backed run could not launch Chromium and
was interrupted with exit 130 after internal runner launch retries. No browser behavior executed,
and web and native-static builds were not run. These historical test outcomes were not rerun during
preservation; original console logs are not part of this portable package.

No production source is changed by this evidence PR. No phone experiment is implied by the cloud
review, and no iPhone performance or shipping acceptance follows. The original report's future
physical-control recipe applies only if a later candidate first meets the equality proof bar. The
model identifier remains `UNKNOWN`, as reported by the original execution.

This PR is closed without merging to preserve the unsuccessful review and its limitations. Private
retrieval receipts, campaign packets, raw traces, device identifiers, and host details remain
outside the publication.
