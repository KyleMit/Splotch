# AI lane: AI art end to end, RN vs shipping

2026-11-09/10, Claude (ai lane). RN = `427756f14`, shipping = `ef3d1eb20`. Raw media, logs and
scripts: `campaign/ai/` and `ai-scripts/` in the rig scratch folder. Weight iPad > Android > web.

## What would matter (named before measuring)

* **Blocker:** one arm cannot get from the AI button to a picture (or to a kind, honest failure) on
  a platform where the other arm can.
* **Major:** a failure path that strands the child (spinner forever, blank card, crash) or tells the
  parent something false, in one arm only.
* **No signal:** the same server behaviour in both arms. Both arms' servers send a byte-identical
  OpenAI request (`openai.ts` differs only in one import path), so a provider-side failure is never
  an arm difference.

## 1. Desk check: which API each installed native build calls

| Question                                               | RN native (`art.splotch.app.dev`)                                                                                                      | Shipping native (`art.splotch.app.baseline.main`)              | Evidence                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| API origin compiled in                                 | `https://splotch.art` (default of `EXPO_PUBLIC_SPLOTCH_API_ORIGIN`; babel enforces HTTPS)                                              | `https://splotch.art` (`__NATIVE_API_BASE__`, Capacitor build) | `grep -a` of the installed-build Hermes bundle / `main.jsbundle`; shipping `web/build` chunks |
| Server that answers                                    | production = shipping's SvelteKit server, version `1.6.2682`                                                                           | same                                                           | `GET /version.json`                                                                           |
| `GET /api/free-generation-grant` on production         | exists; body `{"ok":true,"remaining":10,"limit":10}` passes RN's strict key-set parser                                                 | exists                                                         | read-only `curl` with a random 64-hex id                                                      |
| CORS for RN's headers                                  | preflight allows `X-Async-Generation`, `X-Installation-Id`, `X-Report-Token`; exposes `X-Free-Generations-Remaining`, `X-Report-Token` | same                                                           | `OPTIONS /api/generate-image`                                                                 |
| Async ticket + poll (`202` → `/api/generation-result`) | production speaks it (observed `202` then `502` poll, below)                                                                           | same                                                           | web run against production                                                                    |
| Free-allowance identity                                | SHA-256 of `splotch-free-generation-v1:` + ANDROID_ID / identifierForVendor                                                            | identical derivation (Capacitor `Device.getId`)                | `SplotchAIEnvironment.{kt,swift}` vs shipping `freeGenerations`                               |

**Cutover sequencing:** none needed for AI. RN's native client works against today's production
server unchanged: every endpoint, header and body shape it uses already exists there, and the
installation pseudonym is derived the same way, so a user's remaining free count carries across an
in-place store update. (RN's server is held wire-identical by
`tools/api-smoke/tests/wire-diff.test.mjs`.) Native localhost testing is not possible in either arm
without code edits: RN's babel config refuses a non-HTTPS origin and Android trusts no user CA;
shipping bakes its base at build time too.

## 2. Production AI is down for every client (both arms, server/provider side)

`POST https://splotch.art/api/generate-image?style=Magical` with a fresh free installation id and a
1024×768 WebP drawing answered, at 2026-11-10 04:40 UTC,
`502 {"ok":false,"error":"OpenAI request failed: 400 Complexity 'medium' is not supported for this image model."}`
in 6.6 s. Every one of the 11 production attempts in this lane (direct `curl`, the shipping bundle
in Chromium, both native apps on the Galaxy and on the iPad simulator) ended in that failure,
04:39–05:20 UTC.

* Both arms' servers build the identical Responses API request (`gpt-5.6-sol`, reasoning effort
  `medium`, image tool `gpt-image-2.5-flare` quality `low`); shipping
  `web/src/lib/server/ai/openai.ts` and RN `netlify/server/ai/openai.ts` differ only in one import
  path. Deploying RN's server would fail the same way, so this is **not an arm difference**. It does
  mean no arm can show a real model picture today, and the shipped store app v1.6.0 is affected now.
* No arm-side fix exists; it needs an adapter change shared by both servers (root cause not
  diagnosed: neither tree nor the `openai` SDK mentions "complexity"; likely a provider-side
  parameter mapping). Out of scope for this campaign: no production deploy.
* A failed run releases the free reservation: the Galaxy badge stayed at "1 free left" after four
  failed runs.
* Billing: an OpenAI `400` validation error is normally unbilled, so the real spend is probably $0;
  the ledger carries a conservative $0.06 per attempt (Flare low recorded 3.16¢, 3.94¢ uncached:
  `docs/scratchpad/image-model-bakeoff-2026-09-10.md`, rounded up).

## 3. Results

Rigs. **iPad:** the physical iPad cannot be driven (expired UI-automation grant, see `setup.md`), so
both arms ran on a dedicated iPad Pro 12.9-inch (5th gen) simulator, iOS 26.5 (shipping will not
launch on iOS 27, per the journeys-ipad lane), the shared `campaign/builds/sim/` Release apps (both
call production), driven with WebDriverAgent; fresh install, so 10 free. **Galaxy:** the installed
`art.splotch.app.dev` and `art.splotch.app.baseline.main` through `adb` (both debug-signed, so they
share one ANDROID_ID and one free grant: 1 left). **Web:** headless Chromium 1133×744 against a
local host running RN's real `/api` handlers in `SPLOTCH_API_MODE=test` (fake model, local Blobs
emulator, outside fetch refused; every response carried the test-only `X-Robots-Tag: noindex`). RN
served its `dist/web` export from that host. Shipping's on-disk `web/build` is the Capacitor bundle
(API base `https://splotch.art` compiled in), so its `/api` calls were re-routed in the browser to
the same local host, with 0 requests left to reach production. That bundle also uses the native gate
default (Every time); the web default is Never.

| Path                                    | Platform             | RN                                                                                                                                         | Shipping                                                                                   | Evidence                                       | $           |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------- |
| Turn AI on, allowance shown             | iPad sim             | pass: "10 free AI creations left." (production grant)                                                                                      | pass, same copy                                                                            | `ai/ipad-sim/rn-02`, `ship-03`                 | 0           |
| Gate → style → waiting → result         | iPad sim, production | gate, 8 styles, "Making your picture…"; then **"Hmm, that didn't work"** after about 12 s; Try again → "Still not working"; count stays 10 | identical screens and copy; error after about 6 s                                          | `ai/ipad-sim/pair-first-failure.png`           | 0.18 / 0.12 |
| Gate → style → waiting → result         | Galaxy, production   | same flow; error card 10–25 s after the style tap; retry → "Still not working"; badge stays 1                                              | same flow and copy; error under 10 s; retry about 14 s                                     | `ai/galaxy/rn-strip-1.png`, `ship-strip-1.png` | 0.12 / 0.12 |
| Picture appears + Download              | web, fake model      | pass: `202` → poll → `200` in 6.0 s (n=2); PNG download; count 10 → 9                                                                      | pass, 6.0 s (n=2), PNG download, 10 → 9                                                    | `ai/web2/*-success-*`                          | 0           |
| Sticker (transparent punch-out)         | web, fake model      | pass                                                                                                                                       | pass                                                                                       | `*-success-sticker-*`                          | 0           |
| Real picture, colour it, save to Photos | iPad, Galaxy         | **not driven**: production is down (§2) and native builds cannot point at localhost (§1)                                                   | not driven, same reason                                                                    | —                                              | —           |
| Offline before tapping                  | web                  | AI button hidden while offline, back on reconnect                                                                                          | same                                                                                       | `*-offline-*`                                  | 0           |
| Offline before tapping                  | iPad, Galaxy         | not driven (would mean changing device radio settings); code: RN hides via `expo-network` (`useOnline.ts`), shipping via `network.online`  | same                                                                                       | desk                                           | —           |
| Offline during generation               | web                  | stays on "Making your picture…" for 45–60 s offline (n=2), then shows the picture about 4 s after reconnecting                             | identical: 45 s offline, every poll failing, then the picture about 4 s after reconnecting | `web2/rn-offline-midflight`, `web3/`           | 0           |
| Provider error (`502`)                  | web                  | "Hmm, that didn't work / Let's give it one more go." → Try again → "Still not working … Try the wand again in a few minutes."              | identical                                                                                  | `*-byok-error-*`                               | 0           |
| Provider timeout (`502`)                | web                  | same two cards                                                                                                                             | identical                                                                                  | `*-byok-timeout-*`                             | 0           |
| Safety refusal (`422`)                  | web                  | "Let's try drawing something else!" + "For grown-ups · Report this refusal"                                                                | identical                                                                                  | `web2/pair-refusal-exhaust.png`                | 0           |
| Wrong OpenAI key                        | web                  | "That key could not authenticate with OpenAI." (key not kept)                                                                              | identical                                                                                  | `*-byok-invalid-*`                             | 0           |
| Free allowance used up                  | web                  | AI button hidden; Settings › AI Art: "Your 10 free AI creations are used up." + key field                                                  | identical                                                                                  | `web2/pair-refusal-exhaust.png`                | 0           |
| API rate limit (`429`)                  | web                  | generic "Hmm, that didn't work" → "Still not working"; the server's "wait 51s" text is not shown                                           | identical                                                                                  | `*-ratelimit-*`                                | 0           |

"Colour it" does not exist in either arm: AI art redraws the child's drawing in one of 8 styles
(identical `styles.ts` in both trees), and the result card offers only Download, Report and Close.
Neither arm generates a coloring page from AI.

Lane total: 11 production attempts, $0.66 logged (upper bound; probably $0 billed). Not called:
`/api/report`, `/api/report-image` (the error cards' "Report a problem" was never tapped against
production). No access code, OpenAI key or admin credential was used; the fake `sk-test-*` keys went
only to the localhost host.

## 4. Defects and differences

| # | Finding                                                                                                                                                                                                                                                                                                                                                           | Arm                          | Severity                                   |
| - | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------ |
| 1 | Production AI generation fails for every request (OpenAI `400` "Complexity 'medium'…"); store users are affected now                                                                                                                                                                                                                                              | both (shared server request) | blocker for AI today, **decision-neutral** |
| 2 | Native time to the error card is about 5 s longer in RN (iPad sim about 12 s vs 6 s; Galaxy 10–25 s vs under 10 s) against the same 6.6 s server failure; web is identical (6.0 s each). If it is client-side prep or upload, a real 23 s picture would also arrive later in RN. Coarse (1.5–3 s polling of the UI, two samples per platform); cause not isolated | RN                           | minor, unverified                          |
| 3 | A `429` rate limit reads as a generic failure; the parent is not told to wait about a minute                                                                                                                                                                                                                                                                      | both                         | cosmetic                                   |

Copy, card layout, gate, style picker, allowance accounting and every failure card match between the
arms on every platform driven. No crash, stuck spinner or blank card in either arm.

## 5. Notes for other lanes

* **Shipping `web/build` on disk is the Capacitor bundle** (written by setup's `cap:sync` at 21:56,
  `__NATIVE_API_BASE__ = https://splotch.art`), not the Netlify web build. Any web-lane run on it
  that triggers `/api` traffic calls production, and its first-paint chunks may differ from the
  deployed web bundle.
* The RN app on the Galaxy returns no accessibility tree to `uiautomator dump` ("null root node
  returned by UiTestAutomationBridge", 3 tries, idle canvas); shipping's WebView tree dumps fine.
  For the journeys-android lane's J19 to confirm with TalkBack.
* This lane briefly ran one headless Chromium generation (23:41:15–23:41:37 and 23:42:12–23:42:25
  EST) while the web lane held `rig.lock` for a timing capture; samples in those windows are
  suspect.

## Could anything here flip the decision?

No. AI art behaves identically in both arms, failures included. Production generation is broken for
both arms (and for today's store users) by a shared server-side request. That is worth telling the
owner now, but it does not favour either architecture.
