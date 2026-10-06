# Fourth hosted install refusal

The automatic branch deployment of 6bac65f02b605b6efb0a0545eeda5e6cdc40a76a failed before any
package-manager child. The complete global configuration contained a sole plain absolute `storeDir`
outside the admitted cache namespace. Its actual path was not observed. This was the diagnostic
outcome registered before advancing the branch after Claude's second implementation review and
passing current-head CI.

Deployment: `6ac4d14846ad180008db3fdc`; build: `6ac4d14846ad180008db3fd9`. The dashboard excerpt
records the current Noble new-builds image revision, Node/pnpm versions, refusal class/form and
final failure. It is a selected transcription, not a full log. The native deployment/build API
records establish the source, completed error state and absence of publication. No site setting,
cache, dependency owner or manual deployment retry changed for this run.

The manifest binds the four original records. Registration describes intended outcomes; it does not
assert a passing hosted install. The three earlier failed deployments remain separate historical
records.
