# Current-session recovery report construction

This source delta connects checked recovery refusal and exact retained-picture provenance to the
existing report owner. Both production recovery network guards and the send/reconcile/ACK controls
remain closed. Source construction does not enable recovery or authorize a report send.

An explicit approved recovery send captures a copy of the verified upload, original style, exact
saved credential reference and a credential-header digest before dispatch. It neither pins a new
credential generation nor broadens storage reads. Preparation rechecks the current immutable request
tuple, parent permission and credential lease after every await. The context stays in the report
owner's memory and is discarded on disposal. Restarted, older, pre-admitted or terminal receipts
without this context are unavailable for reporting. No persistence schema, native journal or recipe
change is needed for reports.

The response parser retains only a bounded report token with exact authenticated refusal proof or
verified delivery metadata. Generic failures, advisory 202 status, wrong identities, creation or
expiry, malformed headers and mismatched bytes do not establish report provenance. The existing
server contract remains unchanged: refusal tokens are mandatory for every credential tier; free
picture reports also require a token; authenticated managed and BYOK picture reports may omit it. A
present malformed token is rejected for reporting in every tier. GET does not mint tokens, settle
accounting, authorize generation, dispatch work or call a provider.

Terminal persistence precedes refusal adoption. Picture retention, exact metadata readback and image
admission precede picture adoption. A committed storage receipt is still published after permission
or lease revocation, while no report evidence is adopted in that revoked action. Lost storage
callbacks require authoritative reread and do not manufacture report availability. The held
predecessor, attempt identity, first expiry and all existing recovery holds remain intact.

The report owner binds the original tuple and adopted terminal/output evidence to the current
receipt, including style, source-held predecessor and exact retained output. It rechecks these
bindings during review and after final credential readback. An existing report context cannot
migrate to a changed request, credential or output. Pictures report only the admitted retained
bytes; refusals report only the original drawing, style and checked refusal token. Existing bounded
multipart construction and transport remain the only report send path.

Reporting still requires its own image-report parent gate, current consent epoch, disclosure and
final explicit send confirmation. Generation permission does not satisfy that gate. Credential
leases and current targets remain checked across asynchronous boundaries. Once report delivery has
an unknown outcome, the existing consumed-context rule prevents automatic or manual resend through
duplicate recovery replies or cancellation. No recovery retry, fallback generation or raw POST
duplication is introduced.

The source packet authored focused transport, owner and controller tests without executing them.
ROOT subsequently ran the integrated 104 report tests plus legacy AI regressions: all 166 tests
passed. The 716 recovery/storage/provenance controls, four refusal-UI tests, and seven mounted RSD
AI/recovery tests also passed, as did native TypeScript and the web type check. Four deliberate
production mutations produced the intended assertion failures for malformed picture tokens, changed
current output, mismatched attempt identity and header drift; exact source restoration and the
166-test rerun passed. These checks cover checked refusal and exact picture success;
missing/malformed/overlong proof; optional-token managed/BYOK pictures; wrong
original/attempt/credential/expiry/output tuples; changed current context across awaits; permission
and lease revocation; lost callbacks; committed persistence after revocation; original byte copying;
separate report confirmation; restart unavailability and unknown-delivery no resend. The actual RSD
transform and candidate import inventories include the new recovery-report helper.

ROOT reports passing integrated 3492 source checks and 3493 Kotlin Release compilation plus Swift
parse-only checks for the a69f baseline. Those results do not validate this delta. ROOT owns
inspection and execution after sealed transfer, including formatting, types, relevant tests and
closed-guard checks. Independent review, full iOS compilation, genuine OS persistence and decoder
qualification, external-vault lifecycle behavior, hosted storage/accounting qualification, provider
availability/billing, retention/privacy/capacity and deployment approval remain open. Hashes and
fixture results alone cannot establish them.
