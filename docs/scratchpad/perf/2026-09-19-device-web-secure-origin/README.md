# Device-web secure origin for the AI waiting print (2026-09-19)

This is capture-readiness evidence for issue 1870's two AI-waiting actions (`show AI waiting print`
and `finish AI waiting print`) on the physical device-web targets. It is the plan's
`device-web-secure-origin-r1` unit. It is **not** historical before/after attribution. The frame
figures in these artifacts only show that the actions ran, and nothing here compares them.

A LAN `http://` page is not a secure context, so `crypto.randomUUID` and `crypto.subtle` are
missing. The free-generation path calls them before any request, so the run fails with zero
requests. PR 2059 diagnosed this, and blocks both cues on both web device targets.

## Outcome

| Target                  | Result                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical Android Chrome | **Ready.** Using `adb reverse` with `http://localhost:<port>`, the page is a secure context with both crypto APIs. Both AI actions ran 4 of 4 repeats with every generate request answered by the in-page stub                      |
| Physical iPad Safari    | **Not ready. Needs an owner decision.** There is no local route: iOS has no reverse forward, and a LAN address is not trustworthy. See the approval packet below. The iPad also still has the owner actions it had before this unit |

## The Android route

`http://localhost` is a potentially trustworthy origin in every browser. `adb reverse` makes the
phone's `localhost:<port>` reach the capture host's preview. No certificate, TLS setting, or product
code is involved. This is the same mechanism as `npm run adb:reverse` in `docs/MOBILE/android.md`,
applied to the preview's own port.

```bash
npm run perf:build                                          # instrumented build of this checkout
npm run perf:serve --ignore-scripts -- --port=<port>        # a port preflight shows free
adb -s <serial> reverse tcp:<port> tcp:<port>
npm run perf:android:browser:actions --ignore-scripts -- \
  --url=http://localhost:<port>/ --no-serve --device-id=<serial> --cdp-port=<preflight androidCdp> \
  --actions=ai-waiting
adb -s <serial> reverse --remove tcp:<port>                 # when the session ends
```

The host reaches the same URL, so the runner's served-build check still binds the artifact to this
checkout's build. The session used port 54784 and CDP port 9224, which is what the preflight
resolved.

## Evidence

### Machine-checked

`check.mjs` checks the following from the packaged artifacts and logs:

* **`a1`,** captured with this PR's harness:
  * the page was `http://localhost:54784/`, serving checkout 607f66453c4e;
  * the capture passed with no blocked coverage;
  * each AI action ran 4 repeats, one warmup and three scored;
  * every `finish AI waiting print` sample carries `aiRun`, with `secureContext: true`,
    `randomUUID: "function"`, `subtleCrypto: "object"`, and origin `http://localhost:54784`;
  * each of those runs made exactly one request, `/api/generate-image?style=Magical`, and the
    in-page stub answered it (`generateCalls: 1`).
* **`a0`:** the same route with main 100f749572b7285ee2525b1467ec9e99755f600f's harness. Both AI
  actions pass with no blocked coverage. That harness did not record `aiRun`, which is why this PR
  exists.
* **`n1`, the negative control:** the same build and preview reached over the LAN address. Both AI
  actions are blocked, the record shows `secureContext: false`, `randomUUID: "undefined"` and
  `requests: 0`, and the capture failed.
* **Preflight:** Android input (122.3 contact moves/s) and rotation are proven. The iPad launch
  failed with `Unknown device or simulator UDID`.
* **Sanitization:** every packaged file passes `scanForDeviceIdentifiers`, and none holds a LAN
  address.

### Operator-observed only

These were seen in the session terminal and are not packaged:

* the `adb reverse --list` output (`UsbFfs tcp:54784 tcp:54784`);
* the preview's served entry (`start.CtxMDpz5.js` for main, then `start.Bkpsy1Ao.js` for 607f6645);
* the two `perf:build` logs;
* `git diff --stat 100f7495 607f6645 -- web/ capacitor.config.json package.json pnpm-lock.yaml`,
  which was empty.

Each log's last `exit N` line was appended by the operator's shell from `$?`. The capture tool did
not write it.

### Product identity

The runs use two builds:

* `a0` is main 100f7495 (entry `start.CtxMDpz5.js`);
* `a1` and `n1` are 607f6645, which is main plus this PR's harness-only change (entry
  `start.Bkpsy1Ao.js`).

The entries differ because the build embeds its commit, not because the product source changed. The
empty source diff is operator-observed; it can be re-derived with the `git diff` above.

## Why a paid request cannot happen

* The stub answers `/api/generate-image` inside the page, and `aiRun.urls` shows it was the only
  request.
* Any other fetch passes through to `vite preview`, which serves no `/api` functions.
* No AI key exists on the rig.

## Rejected routes (not repeated)

* **A self-signed HTTPS front plus `acceptInsecureCerts`** (PR 2059): real-device Safari ignores the
  capability and stops on its certificate warning.
* **Clicking through a TLS warning:** declined; a rig must not learn to dismiss certificate
  warnings.
* **Weakening CSP or TLS, or a product-side crypto fallback:** out of bounds.
* **A Netlify deploy preview:** production builds strip the `__aiGenerate` seam and the profiling
  marks, so it cannot serve the instrumented build without a deploy configuration change.

## iPad Safari: approval packet (NOT applied)

The iPad needs an HTTPS origin whose certificate chain it already trusts, or can be made to trust.
Either route below changes a security boundary, so neither was applied. The owner chooses one, or
neither.

**Option 1, recommended: a public quick tunnel with a publicly trusted certificate.**

* **What changes.**
  * Install `cloudflared` on the Mac. It is not installed; `brew install cloudflared`.
  * For the capture session only, run `cloudflared tunnel --url http://localhost:<port>`.
  * This gives a random `https://<words>.trycloudflare.com` URL with a publicly trusted certificate.
  * The iPad trust store is untouched.
* **Exposure.**
  * The instrumented static preview becomes reachable from the internet at an unguessable URL while
    the tunnel runs. It is a static build with the dev-harness seams enabled; there are no `/api`
    functions, keys, or secrets.
  * Traffic, including the unreleased build, passes through Cloudflare.
  * Asset loads gain internet latency. Frame measurement is on-device and unaffected, but page-load
    timing is not comparable to LAN captures.
* **Owner steps:** approve the install and the use of a public tunnel for capture sessions. No
  device steps.
* **Rollback:** stop the process, which ends the URL at once, then `brew uninstall cloudflared`.
* **Harness impact:** none expected. The iPad actions runner takes `--url=<https tunnel>`, and the
  served-build check fetches the same URL from the host. This is unverified until tried.

**Option 2: a local CA trusted by the iPad.**

* **What changes.**
  * Generate a CA on the Mac. Constrain it by name to the Mac's LAN address and `.local` hostname,
    and keep its key only in `~/.splotch-rig/`.
  * Issue a leaf certificate for that address.
  * Put a TLS front on the preview. PR 2059's front exists as a pattern, but the harness needs
    serving support, which is a bounded harness change.
* **Owner steps on the iPad:**
  1. Transfer the CA profile.
  2. Settings → General → VPN & Device Management → install it.
  3. Settings → General → About → Certificate Trust Settings → enable full trust.
* **Exposure:**
  * A trust anchor stays on the iPad until it is removed. If the key leaked, anyone holding it could
    impersonate the constrained names to that iPad.
  * The LAN address can change.
* **Rollback:** remove the profile under VPN & Device Management, and delete the CA key on the Mac.

**Needed in either case (existing owner actions, unchanged by this unit):**

* **Grant.** The XCTest automation grant has expired. A human must be at the iPad during
  `npm run perf:preflight -- --verify-ios-launch` to enter the passcode.
* **Device discovery.** The preflight reused Appium on 4723, whose real-device discovery is stale
  (`Unknown device or simulator UDID`). Either restart the root RemoteXPC tunnel (a password dialog
  at the Mac), or pass the fresh Appium that the local rig notes record as passing discovery.

After approval, the next worker runs `--actions=ai-waiting` on iPad Safari at the approved HTTPS
URL. It must require the same `aiRun` evidence and keep a LAN-http negative control.

## Reproduce

`node docs/scratchpad/perf/2026-09-19-device-web-secure-origin/check.mjs` verifies each file against
`MANIFEST.json`, re-derives the machine-checked claims above, and names the operator-observed and
unsupported items. `package.mjs <serial> <lan-address>` rebuilt this directory from the gitignored
capture directory. It applies redaction only: the serial and UDID become `[redacted]`, the LAN
address `<lan>`, and local paths and process ids are masked.

## Effort

This unit ran from 11:39 EDT (intake) through packaging at about 11:55, plus the review and merge
recorded on the PR. No earlier effort was separately tracked for this blocker. PR 2059's diagnosis
was part of issue 1870's earlier work, and its time was not recorded.
