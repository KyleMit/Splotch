# Security Policy

Splotch is a drawing app for toddlers. It ships as the web app at [splotch.art](https://splotch.art)
and as the Android and iOS apps built from this repository, and it runs a small hosted API that the
apps and the site call. If you find a security problem in any of that, this page says how to tell us
privately.

## Reporting a vulnerability

**Report through GitHub's private vulnerability reporting:**
[open a private report](https://github.com/KyleMit/Splotch/security/advisories/new).

That form goes only to the maintainer. It is the one channel for security reports; **please do not
open a public issue, pull request, or discussion for a suspected vulnerability**, because those
disclose it to everyone the moment they are posted. There is deliberately no email address here.

A useful report says what you found, where (URL, endpoint, screen, or file), how to reproduce it,
and what an attacker could do with it. A proof of concept is welcome; a scanner log on its own
usually is not enough to act on.

## What to expect

* An acknowledgement within **7 days** of the report.
* An assessment and, for a confirmed problem, a fix plan within **30 days**. Reports involving
  children's data or active exploitation get the highest priority.
* Credit in the fix's release notes if you want it, and coordinated disclosure once the fix has
  shipped. We ask that you keep the details private until then.

This is a small open-source project maintained by one person, so those are targets, not guarantees.
If a report goes unanswered past those windows, reply on the same advisory thread.

## What is in scope

* The live site, `https://splotch.art`, including the `/admin` console and the installable web app.
* Every endpoint under `https://splotch.art/api/*`, including image generation, image reports, the
  feedback endpoint that files private issues, access-code and key verification, the admin session
  endpoints, and the CSP violation receiver. [docs/API.md](API.md) describes the contract and the
  intended authentication and rate limits.
* The Android and iOS apps on the stores, and the code in this repository that builds all of the
  above.

Problems worth reporting include anything that exposes a child's drawings or a family's data,
bypasses the admin or access-code checks, lets one visitor act as another, defeats the rate limits
in a way that costs money, or gets past the Grown-Ups Only gate in a way a toddler could find.

## What is out of scope

* Defects in the third-party services themselves (the hosting provider, the app stores, the
  image-generation providers). Report those to the vendor. A problem caused by how Splotch
  configures or uses those services, such as its own headers, function settings, credentials, or
  storage boundaries, is in scope.
* Findings that need a compromised device, a jailbroken phone, or physical access to a logged-in
  admin session.
* Missing headers, missing `security.txt`, or other checklist items with no demonstrated impact. The
  header set is deliberate; see [ADR-0073](adrs/0073-enforcing-csp-first-party-reporting.md).
* Denial of service by volume, and automated scanning that generates real load on the live site or
  real charges on the image-generation endpoint. Please test against a local build instead; the
  [contributing guide](CONTRIBUTING.md) explains how to run one.

## Supported versions

Only the current deployment of the site and the latest release of each store app receive fixes. An
app fix ships as a new store version, and a device keeps running the old build until its user
installs that update, so the fix's release notes say what it addresses.
