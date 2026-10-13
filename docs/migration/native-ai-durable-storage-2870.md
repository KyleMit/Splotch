# Native AI storage source slice

This extends the original native AI experiment. It does not activate a recovery protocol or ACK, and
it does not qualify native storage or power-loss durability. The hosted wire remains the legacy
`/api/generate-image` and `/api/generation-result` contract. The server can still delete a result
before the client receives it. No live generation, provider request, credential read, deployment,
native build or runtime check is part of this slice.

## Owning boundary

`SplotchAIEnvironment.aiStorage(kind, payload)` accepts a finite operation and a JSON string, and
returns a bounded JSON string or rejects. The operations are `read`, `prepare`, `importLegacy`,
`write`, `retain` and `pictures`; each has an actual native AI caller. There is no path argument or
credential field. The original drawing model is validated without changing its UTF-8 bytes. The
native owner pins that exact model and the canonical prepared PNG bytes before returning a
preparation receipt. The journal includes the original identifier, style, version, attempt time and
identifier; its native envelope includes a random nonce, revision and SHA-256/length metadata for
the pinned files. The nonce is local and is not added to the legacy hosted request.

Android uses a fixed no-backup root, one executor and a cooperating OS file lock. Files are created
exclusively with no-follow opens, checked for type, owner and link count, written and synchronized
through their file descriptor, then renamed and followed by a directory fence. Its API floor remains
24. It uses public APIs without numeric open flags, hidden APIs or descriptor-relative race claims.
iOS uses a fixed Application Support root excluded from backup, complete file protection, a serial
queue and an OS file lock. It requests `fsync` and `F_FULLFSYNC`, exclusive no-follow file creation,
exclusive rename and a directory fence. Unsupported directory/full-sync behavior rejects; there is
no weaker fallback. Both implementations assume one cooperating writer in the app's private root and
no child execution with inherited descriptors. They do not claim immunity to hostile same-UID races.

Each revision refers only to immutable, bounded files whose lengths and hashes are rechecked before
readback. Publication, idempotent write/retain, read and gallery admission re-fence pinned files and
the selected journal/directory; a previously unconfirmed rename cannot become a commit receipt
through readback alone. The newest published revision is authoritative; a corrupt published revision
is an error, not permission to fall back to an older unsent state. Successful publication keeps two
journal copies; a failed cleanup can leave a third, charged copy. Nonce and expected revision guard
changes. A repeated retention of the same bytes can return the existing result only after re-fencing
its pinned files, journal and directory. Unknown native callbacks block upload; reopening reads the
native owner again.

The shared 128 MiB AI budget counts native files, pending files, journal copies, outstanding result
reservations and the older Expo AI gallery. There are at most 32 attempt slots and 256 legacy
gallery files. Exhaustion or an unconfirmed fence produces a parent-visible failure before POST. An
incomplete attempt without a published journal is preserved and blocks storage admission; this slice
does not silently delete it or infer that a hosted generation was never sent. A parent
cleanup/recovery UI for such failures remains open. Completed legacy pictures remain read-only. An
unresolved legacy journal is imported with its exact original model and ticket, with absent upload
metadata; it can collect and retain a result but cannot become a prepared upload or trigger another
provider start.

## Validation and open gates

Controlled JavaScript fixtures exercise the actual controller, bridge adapter, RN and native RSD
callers. File-sync, directory-sync, rename, quota and unknown-receipt failures suppress POST. Native
source guards reject missing lock/fence/quota primitives and exact provenance replay binds both
helper files and registrations. Deliberately removing the preparation wait produces an assertion
failure for a funded POST; disabling the source guard produces assertion failures for accepted
mutations. Both controls are restored byte for byte. These checks do not execute OS persistence
syscalls.

Swift syntax parsing is syntax evidence only. The pure Swift helper passes standalone typechecking
against the installed iPhoneOS SDK for arm64 iOS 16.4 after three throwing-expression errors were
fixed. This does not compile the RN bridge or app. Android compilation, both OS
syscall/error/restart/protection/resource behavior, physical qualification and independent review
remain required. A syscall returning success alone is not the campaign qualification needed to
activate POST/ACK in an accepted native release. The ACK and recoverable-service gate remains
closed. The existing shared Parent Center and controller disposal/lifetime work remains separate.
The opt-in recovery proposal still needs version negotiation, exact input/auth binding, strong
ownership before funding, immutable delivery, atomic free settlement and bounded idempotent ACK.
