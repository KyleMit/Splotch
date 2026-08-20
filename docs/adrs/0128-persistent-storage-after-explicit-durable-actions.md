# ADR-0128: Request Persistent Storage Only After Explicit Durable-Feature Actions

**Status:** Active — amended 2026-08-19 to classify background coloring-pack installs as automatic,
not explicit. **Date:** 2026-08

## Context

The web app keeps several kinds of data in browser-managed storage: parent-selected encrypted AI
credentials in IndexedDB, a parent-selected save-folder handle in IndexedDB, and automatically
downloaded coloring packs in Cache Storage. `navigator.storage.persist()` asks the browser to exempt
all of an origin's storage from low-space eviction. The grant is origin-wide and sticky, even though
each call site is reached through one feature.

The original credential boot path called `persist()` during every app launch. Firefox may surface
that call as a permission dialog, so a first-time parent could be asked about persistent storage
before touching any feature that needed it. That launch-time call incidentally protected every
store, but removing it without replacing the feature-specific paths left managed access codes and
save-folder handles without a persistence request.

Three boundaries were considered:

* **Ask on every boot.** This maximizes repeat opportunities for existing data but surprises parents
  who have not chosen a durable feature.
* **Ask during hydration only when stored data is found.** This avoids prompting empty installations
  but still turns app launch into a permission surface for existing parents.
* **Ask only from an explicit durable-feature action.** This makes the browser prompt attributable
  to the action the parent just took, at the cost of not retrying automatically for older data.

## Decision

Persistent-storage requests happen only as a best-effort consequence of an explicit action that
creates durable browser data:

* `state/aiKey.ts` requests after a parent-submitted API key is stored successfully.
* `state/aiAccessToken.ts` requests after a parent-submitted managed access code is stored
  successfully. `captureAiAccessTokenFromUrl()` does not request it: ADR-0127 defines opening an
  invite link as credential delivery, not an opt-in action.
* `drawing/folderSave.ts` requests after the Choose/Change-folder action stores the selected handle.

Coloring-pack installation does not request persistence. ADR-0103 makes those downloads automatic
background work after boot, including on a fresh installation where Coloring Book is enabled by
default. The Cache Storage data remains evictable unless another qualifying explicit action obtains
the origin-wide grant.

Boot hydration never calls `persist()`, even when it finds existing data. Credential requests run
after the secure write and the credential coordinator's version and ownership checks, so a failed,
superseded, or abandoned save cannot raise a storage dialog for data that was not retained. Folder
selection requests only after its IndexedDB write succeeds. Every request stays fire-and-forget:
denial or an unavailable API never fails the feature action.

Because the grant applies to the whole origin, any successful request protects all current stores,
not only the feature whose action triggered it. Existing data without a grant remains evictable
until the parent next performs one of these explicit actions. That loss of automatic retry is
deliberate; silently initiating another browser permission surface during launch would violate the
boundary this ADR establishes.

## Consequences

* \+ Firefox opens directly to the drawing canvas instead of asking about storage on first launch.
* \+ A permission prompt is attributable to a parent action that just created durable data.
* \+ A successful credential or save-folder request protects every origin store, including any
  downloaded coloring packs.
* \+ Failed or superseded credential writes and failed folder persistence do not spend the prompt.
* − Existing data whose grant never succeeded receives no automatic retry during launch.
* − An invite-link access code can remain evictable until the parent later takes an explicit
  durable-feature action.
* − Automatic coloring-pack caches remain evictable when the parent never performs another
  qualifying explicit action.
* − Feature call sites must preserve this boundary; moving a request into shared boot hydration or
  an automatic background job reintroduces the Firefox prompt.
