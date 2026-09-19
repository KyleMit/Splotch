# iPad Safari trusted origin for the AI waiting print (2026-09-19)

Capture-readiness evidence for issue 1870's two AI-waiting actions on physical iPad Safari. It is
the campaign plan's `device-web-secure-origin-r2` unit and continues
[`../2026-09-19-device-web-secure-origin/`](../2026-09-19-device-web-secure-origin/README.md), which
made Android Chrome ready. It is **not** historical before/after attribution and not a performance
result: the frame gate verdict below is reported, not interpreted.

## Outcome

| Check                                      | Result                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trusted origin                             | **Ready.** A local root, name-constrained to the capture Mac, installed and trusted on the iPad. The instrumented build loads at `https://<rig-mac>.local:54785/` as a secure context with both crypto APIs                                            |
| Constraint enforced on the iPad            | **Yes.** Safari refuses a leaf from the same root that names `example.com` beside the permitted address. It also refuses a leaf from the replaced 30-day root                                                                                          |
| Both AI actions, one warmup + three scored | **Yes.** Every `finish AI waiting print` run carries `aiRun`: secure context, `randomUUID`, `SubtleCrypto`, origin `https://<rig-mac>.local:54785`, and exactly one request, the stubbed generate call. No blocked coverage                            |
| Same-build insecure negative               | **Refused.** Over `http://<lan>:54784/`, both actions are blocked (`secureContext: false`, zero requests) and the capture fails                                                                                                                        |
| Frame gates (reported, not attributed)     | `finish AI waiting print` passes. `show AI waiting print` **fails** on a confirmed max breach. The scored repeats' worst post-action frames are 40, 30 and 38 ms, so 2 of 3 exceed 33.5 ms (the warmup's 48 ms is not scored). Post-action P95 is 9 ms |

The gate failure is the first iPad Safari number for this cue, which was blocked before. It has no
before/after or route comparison, so nothing here says whether the product, the route, or anything
else causes it. It belongs to issue 1870's campaign.

## The route kept, and the one tried and not kept

The owner approved trying a local CA first and a restricted Cloudflare quick tunnel second. Once the
iPad was drivable, both were tested; the owner then chose the CA.

|                                               | Local CA (kept) | Cloudflare quick tunnel (not kept)                     |
| --------------------------------------------- | --------------- | ------------------------------------------------------ |
| Secure context, both crypto APIs, app mounted | yes             | yes (second hostname)                                  |
| Page `load`, three alternating loads each     | 43–130 ms       | 224–304 ms                                             |
| Exposure                                      | LAN only        | Public while running, behind the same restricted front |
| Per-session setup                             | none            | start tunnel, wait for public DNS (~45 s)              |

**A DNS trap the tunnel route hit.** The first tunnel hostname was queried through the LAN resolver
before Cloudflare had published it. The router cached NXDOMAIN (the SOA negative TTL is 1800 s), and
the iPad showed "Can't Open Page". A new tunnel worked once only public DNS was polled until the
name resolved. The tunnel was stopped and returned Cloudflare's 530. `cloudflared` stays installed
(`brew uninstall cloudflared` removes it).

## Trust change on the iPad (retained)

* **Installed:** profile "Splotch capture rig CA (constrained, 2026-09)", with full trust enabled.
  * `CA:TRUE, pathlen:0`.
  * Critical name constraints permit the Mac's `.local` name (and, as any DNS constraint does, its
    subdomains) and its `/32` LAN address. The iPad refused an `example.com` leaf. On the Mac only
    (the PR's first rival round), a root with the same constraint lines also refused an unrelated
    IPv4 and an IPv6 leaf. The live root was made before `make-ca` existed, with the same constraint
    lines.
  * P-256 key; expires 2028-09-18.
  * The key is only in the Mac's local rig directory, never in the repository.
* **Replaced:** a 30-day root from earlier in this session, with the same constraints. The owner
  removed its profile, the iPad now refuses its leaf, and its key was deleted.
* **Rollback:** iPad Settings → General → VPN & Device Management → the profile → Remove Profile.
  Then delete the Mac's `~/.splotch-rig/secure-origin-ca/`.

Procedure, including creation: `docs/PROFILING-IPAD.md`, "A trusted HTTPS origin for iPad Safari",
using `npm run perf:ios:secure-origin`.

## Rig blockers met on the way (both machine-checked)

* **The XCTest grant had expired.** A direct WebDriverAgent launch timed out "enabling automation
  mode". A relaunch loop kept the prompt on screen; the owner entered the passcode and WDA came up.
* **Appium's device discovery was empty,** on the long-running Appium and on a fresh one. The root
  RemoteXPC tunnel's registry lists zero tunnels, and an empty answer short-circuits Appium's usbmux
  fallback. WDA was launched directly (`xcodebuild test-without-building` + `iproxy`), and the
  capture passed `appium:webDriverAgentUrl` through `--capabilities-file`, which makes Appium skip
  discovery. No harness change was needed. The registry itself was not repaired; that needs the root
  tunnel restarted at the Mac.

## Evidence

`node docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca/check.mjs` verifies every file against
`MANIFEST.json`, scans each for identifiers, the LAN address, the Mac's name and tunnel hostnames,
and re-derives every claim above marked as machine-checked. `package.mjs` rebuilt the directory from
the gitignored capture directory by redaction only. `negative-controls.mjs` proves the content
checks can fail. It alters one run at a time in a scratch copy and refreshes that run's manifest
hash; a wrong `n1` URL, an empty `n1` entry list, and a lowered raw frame maximum each fail their
own check.

* `runs/c1-ipad-ca-ai-waiting.json.gz`: the capture over the CA route.
* `runs/n1-ipad-lan-http-negative.json.gz`: the same build over LAN http.
* `controls/route-probes-ca2.jsonl.txt`: iPad Safari probes against the two-year root (positive by
  name and address, constraint probe, old-root leaf, LAN http).
* `controls/route-probes-first-ca-and-tunnel.jsonl.txt`: the same against the 30-day root and both
  tunnel hostnames, plus the timing loads.
* `controls/front-*.txt`: allow/deny checks of the restricted front over TLS, locally, and through
  the public tunnel twice; `front-*-requests.tsv.txt` are the fronts' own request logs.
* `controls/mac-trust-checks.txt`: the macOS trust engine's verdicts and the root's extensions.
* `controls/preflight*.log.txt`, `discovery.log.txt`, `wda-relaunch-loop.log.txt`,
  `perf-build.log.txt`.

**Build identity.** Main 1410712ac41bf25f72930a1a18c2c34d53902f07 built with `npm run perf:build`.
Its provenance line says "dirty tree" because the preflight had appended to the tracked grant log;
no product file differed. The capture's served-build check ran against this checkout without
`--allow-foreign-build`, and every page loaded entry `start.Czt61OiU.js`. The iOS runner records no
`productCommit` field.

### Operator-observed only

* The owner's profile installs, trust toggles, removal of the 30-day root, and the XCTest passcode
  entry.
* The unconstrained-root control on the Mac (the same `example.com` leaf verified successfully under
  a throwaway root without constraints). It is described in `mac-trust-checks.txt` but was not
  re-run for the two-year root.
* The router answering NXDOMAIN for the first tunnel hostname, and the tunnel returning 530 once
  stopped.

### Unsupported

* Whether either route changes frame timing. The pages were loaded and ready before each action, but
  the gate failure is not attributed.
* Any historical before/after comparison.

## Effort

Session `bd03add8-2e41-59ea-99f2-b2c0d3130c09`. This package was written partway through the unit:
the interval it first gave (16:28–17:30 UTC) stopped before review, CI and merge. The final
accounting, which runs to 17:53 UTC and separates owner, review and CI waits from active time, is in
[issue 1870's closeout](https://github.com/KyleMit/Splotch/issues/1870#issuecomment-5744094444). A
follow-up corrected this package's checker (`negative-controls.mjs`); its time is recorded on the
same issue.
