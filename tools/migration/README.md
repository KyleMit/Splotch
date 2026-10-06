# Native architecture topology tools

`check:migration:native-topology` validates the private candidate's declared imports, released SDK
alignment, native resolution and typed/Metro/autolinking configuration. It requires the reviewed
full root install and creates no native project or device process.

`gen:migration:script-inventory -- --baseline <lock> --output <json>` inventories every new or
changed v9 lock artifact. The tool reads YAML, fetches public registry metadata/archives, checks
both lock/registry integrity, and inspects package.json hooks, root binding.gyp and root .hooks file
members. It never extracts archives or executes their code. Four workers bound concurrent
inspection. Any malformed source, identity, archive or missing artifact fails before a report is
complete. Hook-bearing rows require explicit review before installation; a metadata flag is no
substitute.

Root pnpm settings, ADR0119 and the migration contract own this boundary. Normal installs,
production controls, native generation and hosted proof are distinct authorized operations. Machine
inventory and compact review live under docs/migration/evidence/native-topology-05. Tests use
synthetic lock/archive fixtures to reject omitted/ambiguous/integrity-invalid input. Inventory
coverage is recomputed from the complete prior resolution snapshot rather than trusting its own
selection list. Actual released Expo search runs before resolve to expose duplicate realpaths;
resolved native project, podspec and plugin directories must stay inside their candidate-owned
package roots.
