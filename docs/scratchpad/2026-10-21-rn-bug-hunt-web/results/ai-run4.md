# AI fix verification — run 4

Candidate cbfa2dc91a861aa41ba64219c34feb0875a37ce7; rebuilt with `npm run build:site`. All API
responses came from the existing AI-1 recorded fixture. No real generation or credential was used.

The accepted batch has **39/39 passing recorder units**, 13 per engine: fixture generation success
at phone/tablet/desktop, six error/refusal cases, dummy-key persistence, ticket polling, offline
recovery and simulated quota recovery. This resolves all eighteen prior blocked units, listed below.

| Previously blocked case | WebKit phone                                                                | Firefox phone                                                                |
| ----------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A04-A05-serverError     | [PASS](../evidence/webkit-phone-A04-A05-serverError-1792570331585.webp)     | [PASS](../evidence/firefox-phone-A04-A05-serverError-1792570491992.webp)     |
| A04-A05-bare502         | [PASS](../evidence/webkit-phone-A04-A05-bare502-1792570341508.webp)         | [PASS](../evidence/firefox-phone-A04-A05-bare502-1792570501653.webp)         |
| A04-A05-malformedJson   | [PASS](../evidence/webkit-phone-A04-A05-malformedJson-1792570351436.webp)   | [PASS](../evidence/firefox-phone-A04-A05-malformedJson-1792570511196.webp)   |
| A04-A05-wrongType       | [PASS](../evidence/webkit-phone-A04-A05-wrongType-1792570361336.webp)       | [PASS](../evidence/firefox-phone-A04-A05-wrongType-1792570520711.webp)       |
| A04-A05-throttled       | [PASS](../evidence/webkit-phone-A04-A05-throttled-1792570371191.webp)       | [PASS](../evidence/firefox-phone-A04-A05-throttled-1792570530180.webp)       |
| A04-A05-refusal         | [PASS](../evidence/webkit-phone-A04-A05-refusal-1792570380374.webp)         | [PASS](../evidence/firefox-phone-A04-A05-refusal-1792570539589.webp)         |
| A06-ticket-poll-success | [PASS](../evidence/webkit-phone-A06-ticket-poll-success-1792570410478.webp) | [PASS](../evidence/firefox-phone-A06-ticket-poll-success-1792570570005.webp) |
| A07-offline-reconnect   | [PASS](../evidence/webkit-phone-A07-offline-reconnect-1792570419474.webp)   | [PASS](../evidence/firefox-phone-A07-offline-reconnect-1792570579042.webp)   |
| W13-ai-idb-quota        | [PASS](../evidence/webkit-phone-W13-ai-idb-quota-1792570429329.webp)        | [PASS](../evidence/firefox-phone-W13-ai-idb-quota-1792570588917.webp)        |

## Both merged fixes hold

* Browser PNG metadata (#3111 / #3112): WebKit and Firefox each complete a fixture generation at all
  three sizes. The original-model, input-byte and retained-result receipts exist in IndexedDB. The
  browser-capture PNG unit tests also pass against the committed WebKit/Firefox PNG fixtures.
* Storage recovery (#3110 / #3116): each engine throws one named `QuotaExceededError` from the AI
  journal's real IndexedDB `put`, displays **Out of space**, sends no generation before durable
  preparation, then reaches the fixture result after **Try again** with the injected failure
  removed. No reload is used, and exactly one generation upload is observed after recovery.

## Evidence and boundaries

[Accepted case receipts](../evidence/run4/ai-accepted.json) ·
[Chromium log](../evidence/run4/ai-chromium.log.txt) ·
[WebKit corrected log](../evidence/run4/ai-webkit-corrected.log.txt) ·
[Firefox log](../evidence/run4/ai-firefox.log.txt) ·
[PNG unit tests](../evidence/run4/png-fix-tests.log.txt).

The first WebKit take rejected same-origin blob reads in the QA driver and is excluded. It remains
in [the discarded log](../evidence/run4/ai-webkit.log.txt); the corrected guard and rerun are
explicit. WebKit's intercepted request object exposes zero upload bytes, so a supplemental local
HTTP fixture host captured the actual multipart request. It returns the same AI-1 recorded image and
never proxies. All three engines completed this additional generation, with decoded uploads of
780×1538:

| Engine   | Actual upload     | Receipt                                                |
| -------- | ----------------- | ------------------------------------------------------ |
| Chromium | 4,612 bytes, WebP | [wire receipt](../evidence/run4/ai-wire-chromium.json) |
| WebKit   | 32,563 bytes, PNG | [wire receipt](../evidence/run4/ai-wire-webkit.json)   |
| Firefox  | 4,138 bytes, WebP | [wire receipt](../evidence/run4/ai-wire-firefox.json)  |

Each receipt contains the uploaded bytes' SHA-256, decoded dimensions and the fixture host's
shutdown result. These three supplemental generations are separate from the 39 recorder units above.

The quota is simulated, offline mode is a Playwright network signal, and report delivery is
fixture-only. These runs do not establish real disk exhaustion, provider delivery or hosted
transport behavior. The older findings remain as historical reproductions; they are verified fixed
at this head.
