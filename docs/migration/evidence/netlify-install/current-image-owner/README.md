# Current Netlify image pnpm store owner

This package retains public image source for revision febd7789d222253fdaba9b87eacf08dcdf49fe9d, tag
`noble-new-builds`, retrieved on 2026-10-06 UTC. The active installer sets the pnpm store to
`$HOME/.pnpm-store`. The actual hosted HOME, resulting global YAML scalar, and setter exit status
remain unknown. This package does not certify hosted install/build success.

Root observed this revision in the third hosted deploy initialization and reports the fourth
automatic deploy advertised the same revision. Those runtime revision observations are supplied by
root; this investigation independently retrieved public image bytes, not the hosted environment.
Architecture/digest actually used by either hosted deploy were not independently observed here.

## Source ownership and exact provenance

The
[public tag metadata](https://hub.docker.com/v2/repositories/netlify/build/tags/febd7789d222253fdaba9b87eacf08dcdf49fe9d-noble-new-builds)
and
[exact OCI index](https://registry-1.docker.io/v2/netlify/build/manifests/febd7789d222253fdaba9b87eacf08dcdf49fe9d-noble-new-builds)
identify both architecture descriptors. `oci/` retains original index, manifests, and configs. Their
digests and all selected source-layer compressed hashes and uncompressed OCI diff IDs were verified
in the original passive inspection.

`source/run-build-functions.sh.txt` is the exact active regular file from both architectures;
`provenance/source-equivalence.json` maps the identical other copy. The two small layer-43 blobs
retain independent manifest-digest-to-source inputs, without retaining duplicate source text. Config
history entries 115/118 describe the new-builds copy/replacement;
`provenance/*-relevant-history-map.json.txt` maps history entries to nonempty layers. Layer indices
are zero-based; source lines are one-based.

| Source                                 | Anchors                                              | Concrete ownership                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `source/run-build-functions.sh.txt`    | Lines 194–247; setter at 218                         | Home cache restore, pnpm selection, home-side store setter, legacy fallback on setter failure, then package installation.                   |
| Same active source                     | Lines 10–13 and 993–1001                             | Default build-base/cache names and cache restoration/no-op home-cache save helper. These do not reveal hosted HOME.                         |
| `source/build-entrypoint.sh.txt`       | Lines 14 and 32                                      | Sources the functions and calls dependency installation. This local entrypoint is source context, not proof the hosted buildbot invoked it. |
| `oci/*-config.json.txt`                | History entry 31                                     | Creates buildbot with home `/opt/buildhome`; does not establish the hosted process HOME.                                                    |
| `pnpm/` exact released-source excerpts | LF lines 257071–257109, 256736–256763, 256777–256825 | Default-global config operation and non-auth global YAML update, absent location/global CLI overrides.                                      |

The final image layer contained only `/tmp` directory/whiteout members. Entrypoint and cleanup
compressed layers are omitted; their immutable URLs, verified digests, diff IDs and exact member
observations remain in `provenance/retrieval.json.txt`. Rechecking these omitted layer bytes
independently requires those public reads. The original receipt lists historical original names,
including omitted inputs; those names are provenance records rather than paths promised in this
package.

## Scope and limits

The current image source is distinct from archived Focal source and contains the setter absent from
that earlier inspected function. No scalar is inferred from the diagnostic file length, image home
default, or cache convention. No allowed namespace or production caller changes are made by this
evidence.

The four pnpm excerpts are byte-identical passive slices of the already qualified local cached pnpm
11.22.0 distribution. `pnpm/provenance.json.txt` binds its whole-file identity and exact LF ranges.
No fresh pnpm archive audit is claimed.

Public registry access used an anonymous pull token in memory, without account credentials; no token
was printed or retained. Six tiny layers totaling 18,627 compressed bytes were originally inspected,
with only the two active-source blobs retained here. The multi-GB image was neither pulled nor
executed. There were no package imports, installs, tests/builds, native tools, site/config
mutations, or new network reads while deriving this package.

Original JSON captures use `.json.txt` so repository formatting leaves their source bytes intact.
Authored JSON metadata remains formatable.

`manifest.json` maps every selected original filename to its byte-identical package path and binds
authored metadata separately. The original sealed inspection remains unchanged. There is no dynamic
checker or runtime verdict in this package.
