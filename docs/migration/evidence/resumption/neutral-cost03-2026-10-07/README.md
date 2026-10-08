# Historical neutral guarded cost03 failure

This focused packet preserves the actual release-variant build of source
67e13bbec7cf5ab92aeab6cfedd9ff7458d9005a and its unchanged
5384d18a9b13b4bb4bbe45e533b92afc709e1819dae561bfcaedc06b161dde4a lock. It records a failed host
build. It does not qualify a complete host, release, browser mechanics, deployed behavior, or
architecture selection. The historical source09 source gates passed before source67 was published;
current facade repairs require their own complete source qualification.

The maintained build completed the reference and retained-control postbuild steps with exit 0.
Neutral compile, React render and Kit build also returned 0. Neutral postbuild returned 1 with two
unmodified hard shipping refusals: 39 startup modulepreloads exceeded 38, and the actual 195816-byte
lazy chunk exceeded 75000 bytes. The public postbuild caller stopped at that guard; the later
eager-error and hosted-topology commands were omitted for neutral. Their omission is not a pass.

The complete graph collector independently refused eight moduleless facade bridges with
`Malformed React chunk contributors`. The original partial result therefore has no complete
evidence. The failed-cost disposition helper returned 1 with
`Only an actual fully captured neutral postbuild failure is eligible for failed-cost disposition`.
The separate strict completed-artifact reader refused check and serve eligibility. These are four
distinct outcomes; the failed host was not served.

The archive contains original result/graph/render receipts, every original copied-child log, actual
controller and disposition channels, the strict reader and its output, the exact eight emitted
facades and their direct emitted targets, the failed lazy chunk, startup HTML, source publication
receipts, and limited output metadata. The source-association record is read-only follow-up
inspection. It does not retrofit producer proof: the old env contributor is still `kind: virtual`,
and actual normalized Kit setup options were absent from cost03. A future complete capture must use
a new artifact and the qualified production observer.

The controller ran 290.205565 seconds within its 1200-second whole deadline and 60-second
finalization reserve. Its build and disposition children returned 1; before/after installed
observers returned 0. Closed channels, released groups and source/installed/semantic Git equality
are retained in the original readback. The focused packet omits the full 145174447-byte input
inventory, complete installed/source trees and unrelated output files. Their original bindings are
stated in the manifest and retained privately; this archive is not a reconstructed complete
artifact.

The archive preserves 115 members byte-for-byte from their closed originals. Its one additional
member, `follow-up/output-bindings.json`, is an explicitly identified read-only inventory of the
existing emitted outputs. Every member is listed by byte length, mode and SHA256;
`manifest.json.txt` binds the gzip archive and each member. No prior failure is relabeled by this
packaging.
