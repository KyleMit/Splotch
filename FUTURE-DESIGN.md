# One prospective design: trusted host, metered preservation operation

Status: requirement proposal only. No implementation, original census/body read, controls pass,
runtime fit, review unlock, or live readiness is asserted. ROOT must create a new governing scope,
source package, grant and receipt schema before any future operation. Old 3508/3587/3603 sources and
receipts stay byte-identical.

## Decision and threat model

Use the established local Mac, trusted tool transport, concrete isolated Python installation and
its standard library/OS loader/native libraries as an explicit trust base. Preserve the existing
Python directory-FD/no-follow, full-tuple, complete-membership and two-pass hashing algorithm in new
source owners; do not introduce a second platform traversal implementation merely to avoid Python.

The new program handles accidental wrong-root access, dirty-tree mutation, omission, rebinding,
misattributed identities, hidden application-source changes, budget/deadline failure and invented
success evidence. It assumes the already trusted local platform executes the admitted program and
reports filesystem/process facts truthfully. A malicious kernel, loader, interpreter, standard
library, platform crypto implementation, tool host or privileged writer that forges observations
is outside this model. Those assumptions must be declared in the grant and final receipt, not
hidden behind complete-startup flags.

This trust choice is consistent with the human's same-Mac workflow and the old runbook's existing
trusted ROOT callbacks. It is a proposed prospective policy choice. It does not retrospectively
change the meaning of any previous cap or qualification claim.

## Finite contract

Create a new schema, for example ROOT_TRUSTED_HOST_AI_PRESERVATION_V1, which is deliberately
incompatible with ROOT_COMPLETE_RUNTIME_STARTUP_CLOSURE_3587_V1 and the old review-unlock consumer.
Use exactly the original AI unit, owner, repository, HEAD, authenticated source/index/staged pins,
and original review identity. No alias, reset conversation, synthetic reviewer identity, additional
review round, excluded-history clone or provider change is allowed.

The program has read capability only for the original AI root, explicitly admitted immutable
input/source/tool references, and current metadata operands granted for foreign/protected fences.
Writes are limited to fresh absent output/control roots. Original content is never imported,
compiled or executed. Read-only directory-relative file opens retain existing no-follow open/path/
FD guards. Output roots must not alias or hardlink original/retained roots. Input content cannot
supply arbitrary paths, tool names, source modules, commands, credentials or network endpoints.

Keep authenticated cached application sources and finite entrypoints. Invoke the concrete resolved
Python executable with the existing -I -S -B - flags and exact cached stdin. Pin its direct file
identity/hash and the finite trusted probe executable identities. Admit the application's exact
source/module set; reject additional application imports or non-stdlib origins. The standard
library belongs to the declared platform trust base; checking its expected origin does not claim
that every transitive library load has been metered. Never read original package code as an import.

The old controller's stable original guards remain: owner-inclusive dev/inode/mode/UID/GID/nlink/
size/mtimeNs/ctimeNs; all-type membership including empty directories; complete regular-body
coverage including every concrete Git/cache file; contained dependency links; explicit borrowed
aliases; exact internal hardlink groups and refusal of external hardlinks; known historical source,
raw index, staged records and HEAD/ref checks. Capture the index once per pass while hashing that
same read buffer; parse only its captured bytes in the future preservation operation.

Retain genuine tool terminal chunks, numeric exits, both EOFs, complete bounded channels and exact
actual stdin. Track every controller, closer and probe PID/private PG created by the operation.
Independently establish their absence after genuine return and verify foreign process identities/
TCP fences. A missing child ledger, unavailable tool boundary, timeout or crash is a retained
refusal even when cleanup succeeds. ROOT remains the one execution owner.

## Clock and state transitions

1. ROOT starts one fresh firstUTC before the first operation-specific source/pin preparation or
   startup admission read. Record actual preparation events and reserve closure/failure capacity.
   Source-authoring work from older packets is not relabeled same-scope execution preparation.
2. Admit the new package, trusted-host declaration, direct tool/source identities, finite operands,
   isolated control results and required callbacks. Unknown controlled sizes/operands remain
   interlocks. No original regular body has been read.
3. Launch the genuine controller and record its actual identity/PG/parent. ROOT releases it only
   after authenticating its STARTED record. Execute a complete metadata-only original census and
   compute fresh worst-case body/metadata/output reservations from that census.
4. Refuse before original body reads unless the new operation's full controlled bound, all current
   operands, the positive ROOT/child closure reserves and remaining work time fit. A retained case
   or source-only plan cannot release the original bodies.
5. Perform the two complete regular-body passes. Compare exact body digests/membership/tuples and
   known historical source/index/staged/HEAD facts. Emit only a pending result.
6. ROOT records the actual controller return and immediately runs an independently implemented
   closer. It repeats the complete metadata census, validates the pending result/event ledger,
   authenticates relevant protected metadata fences and checks owned/foreign process operands.
7. ROOT independently reconciles final costs and records the closer's genuine terminal/EOF, final
   own/probe PID and PG absence and foreign fences. Finish by the earlier of actual controller
   terminal+60 seconds or firstUTC+360 seconds. Work stops by firstUTC+300 seconds. No reset clock.

Independent closure here means independent verification logic and actual observations. It is not
an attestation independent of the declared trusted operating system or tool transport.

## Accounting boundary and caps

The unit is **controlled logical operation bytes**, with explicit charged occurrences of physical
regular-file reads, metadata/name/link observations, authenticated reference reads, captures,
application stdin/envelopes, decode/JSON/hash/compile/cache materializations, application buffers,
channels, grants/journals/receipts, output writes/readbacks, probe inputs/outputs and cleanup.
Streaming a body into SHA uses the original read buffer; count each physical regular-body read
once, and count separate digest/metadata materializations. No compressed representation substitutes
for uncompressed payload sizes. Every controlled operation receives the shared charge function;
callbacks cannot return uncharged aggregate assertions.

The platform's implicit startup execution, stdlib/native-library reads, dyld/shared-cache paging,
allocator internals, kernel/tool-host traffic and unrelated host activity are **unknown** under this
model. They are explicitly outside the controlled-byte accounting claim, never assigned zero and
never described as measured. Record ambientPlatformBytes as unknown/null with a textual exclusion.
Elapsed operation-specific startup/preparation time still belongs to the original clock. Direct
file reads performed to authenticate executable/source/reference pins are inside the controlled
ledger even though the platform's separate implicit execution reads are outside it.

| Cap or known term | Preserved prospective value | Admission meaning |
| --- | ---: | --- |
| Work plus closure | 300 + 60 seconds | One fresh firstUTC; no inherited or restarted clocks. |
| Controlled aggregate | 8,589,934,592 bytes | Body + controlled metadata + output, including all operation-specific preparation and closure. |
| Controlled metadata plus output | 536,870,912 bytes | No hidden source/reference decode, channels, journals or receipt copies. |
| ROOT metadata | 67,108,864 bytes | Contains a 33,554,432-byte controlled preparation/startup suballocation and the existing positive failure reserves. |
| ROOT output | 4,194,304 bytes | Final receipt materialization/write/read and failure output remain budgeted. |
| Retained full original body bound | 5,940,426,380 bytes | Conditional 3507 case only; includes two passes and EOF-bound bytes. |
| Retained known metadata/output | 490,963,430 bytes | Conservative comparison baseline only, not a new implementation's measured cost. |
| Retained conditional aggregate | 6,431,389,810 bytes | Never current fit. |
| Retained remaining metadata/output | 45,907,482 bytes | Maximum additional controlled terms if the retained baseline remains unchanged. |
| Retained remaining aggregate | 2,158,544,782 bytes | Does not override the tighter metadata/output remainder. |
| Ambient platform traffic | Unknown; no numeric value | Outside this narrower claim; cannot certify the old universal aggregate. |

Do not reuse the old planner unchanged: its runtime term names include complete startup-reference
assumptions. Supply a new explicit bounded formula with these semantics. Preserve the numeric caps,
count every controlled startup/reference occurrence, and use conservative fixed upper bounds for
finite transport/source/receipt/probe terms until actual values are reconciled. The retained full
64 MiB ROOT allocation already covers ROOT's named application work; any additionally counted
cross-boundary occurrences must be itemized to avoid either omissions or double reconciliation.
All remaining controlled terms need known positive finite bounds before original reads. Unknown
controlled terms cause refusal. The new source package must show whether it fits; this audit has
neither measured its runtime terms nor presumed savings.

If “8 GiB” is intended to cover all transitive implicit operating-system/interpreter traffic, this
proposal does **not** preserve that broader semantic promise. It preserves the numeric controlled
operation cap and states the domain change explicitly. ROOT must not accept it as proof of the old
all-startup aggregate. If the broader semantic is a governing human requirement, use a real external
observer instead; no unknown ambient cost can be admitted by reserving an invented constant.

## Receipt claims and compatibility

The new receipt separates controlledAccountingComplete, originalCurrentTwoPassExact,
knownHistoricalPinsMatched, finalCurrentMembershipExact and trustedHostAssumptions. Each remains
false/pending until genuinely observed. It records original reviewRoundsUsed:0,
reviewConversationOpened:false, projectionApplied:false and reviewUnlockEligible:false. Store
unknown historical domains and protected coverage levels explicitly.

| Existing promise | Can the proposed operation satisfy it after real successful execution? |
| --- | --- |
| Exact original AI current all-type/body consistency | Yes, with both full passes and independent current census; unchanged algorithmic guards. |
| Known retained source/index/staged/HEAD matches | Yes, only for the exact authenticated historical pins actually checked. |
| Entire historical dependency/Git/directory equality | No; missing historical baselines remain missing. |
| Original identity and review budgets | Yes, through immutable unit/owner/HEAD/reviewer mapping and metadata authority; no review is launched. |
| Finite controlled-byte cap and one closed clock | Yes, after fresh fit, actual charged execution and final reconciliation. |
| Old complete transitive startup and universal byte accounting | No. Old startup flags stay false/absent; ambient cost stays unknown. |
| Protected seven-domain whole-root body authority/common interval | No from AI-only work. Preserve existing protected gaps; metadata fences are labeled metadata-only. |
| Old side_authority/wholeOriginalProtected or old projection unlock | No. A new consumer cannot silently translate this receipt into the old schemas. |
| Fixed projection and legitimate initial review | Remain closed pending a separate source-bound reviewed consumer/protected-authority design and normal trusted review admission. |
| Final whole-campaign completion | No; all product, runtime and final independent campaign reviews remain outstanding. |

A future review consumer must be reviewed against its actual governing requirement before it can
accept any new qualification schema. This audit does not authorize replacing protected body proof
with metadata-only observations or opening a review. It also does not require reopening saved/held
content simply because the old schema asks for more authority; any local access needs its applicable
ROOT scope and all disclosure exclusions remain in force.

## Required meaningful negative controls

All controls below are proposed and UNRUN. Each negative needs a matching positive fixture and a
source-bound genuine returned tool result before a real original operation.

| Control | Required observable failure |
| --- | --- |
| Full positive original fixture | A fixture containing source, Git/cache regulars, empty directories, allowed links and internal hardlink groups completes both passes, final census and ledger reconciliation. This positive establishes that the finite design can make progress. |
| Body/owner/member mutation | Same-size body mutation, UID/GID/full-tuple changes, removed file, added empty directory and new Git/cache regular each prevent qualification; every regular is accounted. |
| Path and alias attack | Symlink escape, dangling/absolute link, directory-FD/path rebinding, changed borrowed alias and external hardlink each refuse; exact allowed internal groups pass. |
| Wrong original identity | Wrong unit/owner/HEAD, raw-index checksum/hash or staged digest refuses; a synthetic base or new reviewer alias cannot substitute. |
| Unadmitted execution input | Extra application source/import, changed cached stdin/hash, unexpected module origin, relative executable or unauthorized tool name refuses before original body reads. Trusted stdlib presence does not authorize third-party/original imports. |
| Controlled unknown/cap overflow | Null controlled term, omitted positive startup/reference bound, oversized source/reference/channel, one byte beyond aggregate or metadata cap, or spent cleanup reserve refuses before bodies where preflight can detect it. Unknown ambient bytes remain null, not zero. |
| Ledger omission/duplication | Omit a read/copy/decode/receipt event or reconcile a ROOT delta twice; final event sum fails. Exact-size/EOF and short-read fixtures distinguish real captured buffers from unobserved cost assertions. |
| Clock boundary | Expire during preparation/work or at terminal+60/firstUTC+360; no new clock may rescue the result. |
| False terminal/cleanup | Missing genuine numeric exit, terminal chunk or either EOF, incomplete channel, surviving/reused PID/PG or foreign identity/TCP change refuses. Child self-report and hash cannot supply tool provenance. |
| Crash/unknown child cost | Kill a controlled fixture mid-read; preserve raw failure and unknown ledger, close only owned processes, and keep qualification false even if absence is proven. |
| Unauthorized mutation/egress | Attempt an original write, output alias, provider/network call or disclosure-excluded path; capability/operand admission refuses with no actual original effect. |
| Schema laundering | Feed the new trusted-host receipt to the old complete-startup/protected/review consumer; it refuses. Try setting old complete-startup flags in the new grant; the new schema rejects them. |

A fixture that accepts explicitly unknown ambient traffic proves only the new declared accounting
boundary; it is never called a successful full startup closure. No synthetic control proves actual
original preservation, actual foreign process safety, actual tool return or a current fit.
