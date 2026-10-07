# L0 hosted portability correction

Hosted Tests run 37564712316, Browserless job 112609681680, failed at source
5d739c9921a9c011a594eba9139eb1ea34538a36: two actual iOS receipt tests created a hardcoded
`/private/tmp` directory on Linux and received `ENOENT`. The complete native-connector job log, run
metadata, step metadata and original source bytes are retained in the
[receipt capsule](receipts.tar.gz) and [complete member manifest](manifest.json.txt). This failure
is separate from deliberate rejection controls.

Host receipts use canonical platform temporary roots or canonical `/tmp`, preserving
new/nonexisting, owned-name and real parent-escape guards. Tests use `os.tmpdir()` and canonicalize
actual fixture paths. A real parent symlink escape is refused before output creation; an owned
temporary destination restores success. Materialization retains its separate macOS fixture/signing
path policy. Its CLI visibly refuses Linux before source or output IO; shipping Android/Linux builds
remain a separate consumer. The platform branch control invokes the real CLI with an explicit
platform preloader and is a host control, not Linux native execution.

The qualified source tree is 8c7807d6ff0f114f0928cd27fd6dc74cd4abd630: current HEAD plus exactly
four maintained portability paths staged into a separate owned index. The actual worktree index was
untouched during the gates. Complete before/after source and qualified inherited JavaScript
runtime/lock/installed-metadata inputs match. The mirror's exact command owner treats only child
exit zero as success; the capsule records every individual passing stage and preserves full
channels.

| Invocation                                               | Actual exit | Qualified outcome                                                                  |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Old receipt-owner rejection after portable fixture setup | 1           | Two intended `L0_OWNED_OUTPUT_ROOT_REQUIRED` failures; distinct from hosted ENOENT |
| Restored portable receipt controls                       | 0           | Three controls, including actual escaped/restored CLI destination                  |
| Final scoped source controls                             | 0           | 62 tests across 10 files                                                           |
| Full Quality                                             | 0           | All 15 stages, including format/check/lint                                         |
| Full Browserless                                         | 0           | All five stages; 7,814 tool tests and 42 API smoke cases                           |
| Fresh released / reader / held macOS materialization     | 0 / 0 / 0   | Every original/overlay byte and mode requalified at the changed producer           |

SMOKE_PORT 5300 was explicitly unused before the workload and free afterward. All owned outer
process groups were independently absent; no controller signals were sent. Every passing gate
preserves closed raw outputs and finalized receipts. Original frozen pure-control and full-source
controller identities are retained separately.

Fresh eligible fixtures are the `released`, `reader` and `held` portable roots named by the
capsule's producer requalification and baseline manifests. Their original/overlay/configuration
bytes equal the earlier preparations, while source receipt hashes bind the changed producer. This is
source-only reuse qualification. No installation, native build, runtime, profile or native
persistence claim is made. An earlier sandbox materialization with premature output hashes remains
an accidental setup failure in the owned host records; its root is ineligible.

Original Claude conversation 1b406e61-641e-4cf8-86fb-2b1cd7548469 retains two used rounds and one
reserved for complete frozen changed L0 source plus actual same-ID/held evidence. The updated
capacity map includes this portability delta without destination transactions, pack/job successors
or signed-channel acceptance. That final round remains unspent and provides no material
repair/re-review reserve. Shared Java21 runtime qualification, a separate native lease, actual
native execution, exact-head hosted CI and final review remain pending.

The initial document-reference invocations ran before every linked capsule file entered Git's
tracked inventory. Both resulting setup refusals are retained as actual publication failures, not
negative controls. Staging the complete package restores the existing reference checker without
changing its policy.
