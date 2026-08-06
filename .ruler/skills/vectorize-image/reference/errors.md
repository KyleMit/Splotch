# Vectorizer.AI — error responses

Inlined from <https://vectorizer.ai/api/errors> (captured 2026-08-06). The HTTP statuses and error
codes are exhaustive; the **messages vary**, so branch on `code`, never on message text.

Error body shape (see [`api.md`](api.md)):

```json
{ "error": { "status": 400, "code": 1006, "message": "Failed to read the supplied image. " } }
```

Observed live: a `/vectorize` call with no image source returns HTTP 400 with
`{"error":{"status":400,"code":1005,"message":"Missing image parameter"},"dataReceived":null}` —
note the extra top-level `dataReceived` key, which the docs do not mention. Failed requests are not
charged.

## Auth and account

| HTTP | Code | Meaning                                              | What to do                                             |
| ---- | ---- | ---------------------------------------------------- | ------------------------------------------------------ |
| 401  | 1001 | Couldn't find the API Id specified                   | `VECTORIZER_ID` is wrong or unset                      |
| 401  | 1002 | That API Key has been disabled                       | Re-issue the key                                       |
| 401  | 1003 | Account suspended due to abuse                       | Contact admin@vectorizer.ai                            |
| 401  | 1004 | The provided API Secret is incorrect                 | `VECTORIZER_SECRET` is wrong                           |
| 402  | 1008 | No API subscription for production or preview images | Use `mode=test`, or the plan is a non-API subscription |
| 402  | 1010 | Subscription past due                                | Update the payment method                              |
| 402  | 1011 | **Out of credits**                                   | Upgrade or renew — the 50-credit budget ran out        |

## Request problems

| HTTP | Code | Meaning                                                                                |
| ---- | ---- | -------------------------------------------------------------------------------------- |
| 400  | 1005 | Missing image parameter                                                                |
| 400  | 1016 | Image file parameter present as a *string* — you sent the filename, not the file bytes |
| 400  | 1006 | Failed to read the supplied image                                                      |
| 400  | 1019 | API parameter error (the message lists the parameters received)                        |
| 413  | 1012 | Image byte size too large (max 31,457,280 bytes)                                       |
| 413  | 1013 | Image pixel count too large (max 33,554,432 px) — pre-shrink it                        |
| 400  | 1023 | The parameters would produce a PNG larger than the max result size                     |

## `image.url` fetch problems

| HTTP | Code | Meaning                                      |
| ---- | ---- | -------------------------------------------- |
| 400  | 1020 | The URL did not return a 200 status          |
| 400  | 1021 | The URL did not return an image content type |
| 400  | 1022 | Exception fetching the URL                   |
| 400  | 1024 | Exception parsing the URL                    |

## Image tokens

| HTTP | Code | Meaning                                                 |
| ---- | ---- | ------------------------------------------------------- |
| 400  | 1026 | The image token belongs to a different account          |
| 400  | 1027 | The image token has expired (retention elapsed)         |
| 500  | 1025 | Failed to retrieve the image token from storage — retry |
| 500  | 1028 | The image token is corrupted and cannot be used         |
| 500  | -4   | Failed to store the image token — retry                 |

## Throttling and capacity — retry these

| HTTP | Code | Meaning                                                                                                                                                                                               |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 429  | 1015 | Slow down. Back off linearly per thread: 5s, 10s, 15s, …; reset after a success.                                                                                                                      |
| 400  | 1017 | Not enough time left to start vectorization after preparing the submission — a very slow `image.url` fetch, or severe server load. Retry in 60s; if using `image.url`, host the image somewhere fast. |
| 503  | -3   | Workers overloaded; more are spawning, online in a couple of minutes                                                                                                                                  |
| 503  | -10  | Internal timeout — try again                                                                                                                                                                          |

Anything `5xx` is theirs: wait and retry, and email them if it persists. Recent errors for the
account are listed at <https://vectorizer.ai/account#recent_api_errors>.
