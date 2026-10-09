# Security and retained checkpoint acceptance

[PR 2718](https://github.com/KyleMit/Splotch/pull/2718) source
d1225d202e5bb7b2e925870fce5964d798b47ed7 was accepted by the
[final original Claude review](https://github.com/KyleMit/Splotch/pull/2718#pullrequestreview-5465740182)
with zero findings/unverified claims and
[exact-source CI](https://github.com/KyleMit/Splotch/actions/runs/37881689559): eighteen successes,
five conditional skips, zero failed or pending checks. The original
c462732d-12c3-4b4c-9bf8-906e9c56db21 conversation completed three ordinary rounds; no capacity was
transferred from F1 or another unit.

Normal merge f61f0c842abd2c4d4ab0eb1f3058786d245c444a preserves the reviewed
c0ca2f6dc7d7d385ecb2307c7fda91605dab240d checkpoint ancestor. Its tree
a7ded5191abea0b190795c5bf307e27285958f80 equals the final PR source and tested GitHub merge ref
944788da322876bfa2577cf4b0e87f662187c2f2. The reviewed lock digest is
3704d14e3bc2a8d3070317b4de25ad2b322ffce08b36cc52bdf87c43edbbdcee.

The [final CI report](FINAL-CI-REPORT.json) binds all seven serial retained calls,
source/checkpoint, artifact IDs and official digests. The
[content verification](RETAINED-PROOF-CONTENT-SUMMARY.json) records the actual installed lock,
fourteen completed build children, three distinct successful browser invocations and owned process
closure. The [ZIP member manifest](export-member-manifest.json) records all forty-six regular
members read and CRC/SHA checked, including the complete source/install input inventories. These are
data receipts rather than substitute harness inputs.

The release ZIP is 15,150,905 bytes, SHA256
e629674d6f007af875ffcc786f956c3c134b4e307b0dde7a44a95bd7e9ae0d6b. The mechanism ZIP is 15,551,915
bytes, SHA256 86a665c9b7191b20f10e56f6c7e08bbf7f0079abad3266f79acdecd45b022cbf. Both official
digests and sizes match the downloaded bytes. Original ZIPs, full retained job log, native readback
and private original review/ledger receipts were sealed in the canonical same-Mac campaign logs
before the CI uploads expire on 2026-10-16. The reviewer relied on the handler's verified ZIP
summaries rather than reopening the ZIPs.

This acceptance covers the narrow security resolution and source-specific retained-host checkpoint.
It accepts no migrated native product, framework, deployed/physical performance or campaign
completion. Earlier failed guard execution and review suggestions remain preserved. A subsequent N1
dependency change requires a new exact checkpoint; this record cannot qualify a different lock.
