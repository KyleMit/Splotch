# ADR-0151: Extract Bundled iOS Probe Reports Through Preferences

**Status:** Active **Date:** 2026-08

## Context

A performance probe running from the installed iOS app must keep the page on the bundled
`capacitor://localhost` origin. Sending its report to a plain-HTTP LAN probe host is mixed content,
while loading the page from that host no longer measures the bundled app and leaves page identity
unprovable. Android can read the bundled page through an idle CDP connection, but WKWebView has no
equivalent reliable unattended report transport on the capture rig.

We considered a local TLS report host and new native bridge code. TLS adds certificate trust and
host lifecycle to every capture while still moving data over a network the product does not use. A
native plugin would create a new production-capable surface solely for profiling. ADR-0005 already
configures Capacitor Preferences for native durability, and Apple provides a host-side,
app-container-aware copy command.

## Decision

Harness-enabled iOS builds use Capacitor Preferences as a one-report mailbox. The dev-harness seam
in `web/src/lib/boot/devHarnessSeam.ts` is armed with a random UUID, serializes the complete probe
report under that ephemeral key, and awaits a direct Preferences write in `web/src/lib/storage.ts`.
It deliberately does not duplicate the report in localStorage. Release builds compile the seam out.

`tools/perf/ios/capture-xcuitest-screen.mjs` drives trusted XCUITest input, then backgrounds and
foregrounds the app so iOS flushes UserDefaults before `tools/perf/ios/bundled-report-channel.mjs`
pulls the Preferences plist through `devicectl`'s app-container copy operation. The host accepts the
value only when the per-session nonce, armed page URL, exact bundled origin, probe and wrapper user
agents, full table counts, and serialized UTF-8 byte size agree. Cleanup clears the mailbox and
flushes its removal on every exit path, including a timeout, validation refusal, or interrupt. The
artifact records `pageDelivery: "bundled"`, a proven container-nonce page identity, and the channel
evidence.

Automated XCUITest proves the transport and provides repeatable regression input. The same command's
`--hand-input` mode records real-finger input, but the WebDriverAgent session remains attached while
the operator draws. Its coalescing result is an experimental control, not a clean witness, until a
paired attached-vs-detached run or proven close-and-reattach workflow shows WDA does not perturb
touch delivery.

## Consequences

* \+ Bundled iOS reports leave the device without mixed-content HTTP or remote page delivery.
* \+ A random mailbox key binds the app-container value to the live capture session and makes page
  identity independently checkable by the host.
* \+ Exact byte and table-count checks exercise the full report size rather than proving only a
  small control message.
* \+ The implementation adds no native code and reuses the app's established Preferences plugin.
* − Each capture backgrounds and foregrounds the app after measurement to flush the mailbox, adding
  a lifecycle transition to the report-collection phase.
* − `devicectl` and access to the app data container make this a local physical-device workflow, not
  a hosted-device transport.
* − XCUITest automation can validate the channel but cannot settle human-finger coalescing; that
  evidence still requires the operator to touch the device and a paired control to clear the live
  WDA session as a confound.
