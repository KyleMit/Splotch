# Ancestor diagnostic follow-up

Claude's [third implementation review](claude-r3-findings.json.txt) gave GO for the home-store
repair on d70d6976a116100cec8cc169365e5dfd97130476, with one diagnostic nit. Its
[posted review](claude-r3-posted.json.txt) and [completed CI](reviewed-d70-ci.json.txt) refer to
that source, before this correction. No fourth formal review is claimed.

The helper labels only the exact fixed home as `home`; proof failures above it use the additional
finite `ancestor` role. Store/version precedence and all admission, filesystem, cleanup and
manager-child predicates remain. Root independently reviewed the exact two-file delta against
Claude's requested correction.

The added test drives the copied public CLI with a symlinked parent and its real target/home wholly
inside its owned canonical fixture root. Global configuration stays in a separate owned XDG tree.
Before applying the helper change, the actual
[predecessor control](controls/predecessor-negative.log.txt) reached the intended role assertion and
failed: expected `ancestor/link`, received `home/link`. Its earlier zero-child, sanitized-error,
sentinel and privacy checks succeeded. This is an intentional negative control, not a setup failure.
With the correction, all 151 focused controls pass, including the new test and previous 150
controls.

The corrected source passed all 7,506 tool tests in 320 files and all 15 Quality checks. Nine
released-pnpm steps also passed again: version, actual global writer, three scalar getters, frozen
baseline, warm qualified clean install removing seeded stale leaves, five-context dependency witness
and release build/postbuild checks. [Execution binding](execution-binding.json) identifies the
actual formatted source and all five unchanged runtime owners; [protocol](real-pnpm/protocol.py.txt)
and [receipt](real-pnpm/receipt.json.txt) bind the actual execution and original logs.

Released-manager controls use a disposable canonical home and only substitute the fixed-home
declaration. Witness platform/source facts remain synthetic and the build uses `NETLIFY=false`.
These observations do not establish actual hosted HOME/scalar, install/witness/build success or
native/product performance. Current follow-up head CI and automatic hosted acceptance remain pending
before merge.

The [preceding home qualification](../home-store-qualification/README.md) retains its separate
source/result bindings, public-image provenance, planning decision and historical failure records.
Raw captures here use `.txt` suffixes and retain their original bytes. `manifest.json` binds this
follow-up alone.
