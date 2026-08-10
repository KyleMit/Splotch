---
name: api
description: HTTP API reference for the /api/* endpoints — generate-image, report-image, verify-access-code, verify-key, report, csp-report, and the admin bearer-session endpoints, plus the CORS, rate-limiting, and auth model. Use before adding, changing, or calling any /api endpoint.
---

# Splotch HTTP API

The full contract lives in **`docs/API.md`** — request/response shapes, status codes, headers, and
per-endpoint rate limits. Read the endpoint's own section plus the shared preamble at the top of the
file, which covers the CORS posture, the credential model, and the canonical failure shape every
endpoint returns.

| Group         | Endpoints                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| AI generation | `POST /api/generate-image`, `/api/verify-access-code`, `/api/verify-key`, `GET /api/free-generation-grant` |
| Feedback      | `POST /api/report`, `POST /api/report-image`                                                               |
| Telemetry     | `POST /api/csp-report`                                                                                     |
| Admin         | `POST /api/admin/login`, `/api/admin/tokens`                                                               |

Also in the doc: **Validating the API** (the contract smoke tests to run after a change) and **Local
development** (how to get the functions running at all — `npm run dev` alone does not serve `/api`).

Before changing an endpoint:

* These routes are **not bundled for native**. The apps call the hosted API through
  `__NATIVE_API_BASE__`, so a contract change ships to installed apps that were built against the
  old shape.
* `.claude/rules/server-api.md` loads automatically when you edit files under the API routes and
  carries the implementation rules; this skill and `docs/API.md` are the contract.
