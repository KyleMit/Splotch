# Standalone page share cards

The four cards identify Privacy, Changelog, Feedback, and Beta when their links are shared. Each
card is a committed 1200×630 PNG captured from the real Svelte harness at device scale 1, using
Quicksand, the canonical Splotchy mark, the crayon strip, and the decoded handmade-paper texture.
The short existing page names also supply the image alt text. Per-release cards remain outside this
change.

## Boundaries

`socialCard.ts` owns the four names, filenames, alt text, dimensions, and hash-bearing URLs. The
harness receives those values through its server load and imports only the data type in client code.
An initial runtime import added a home startup chunk; moving that edge to server load restored the
pinned 40 web chunks. The native build retains its pinned 28 chunks. Neither cap was changed.

The home image remains byte-identical: 556002 bytes, SHA-256
`f00b469daa03f7855480d5f5a18eb65d888a506ed699813a056d6440e868857c`. Other paths continue to use it.
The all-or-nothing SocialCard props and native tag guard are retained. The generated page images are
excluded from both PWA precaching and native exports; the offline app shell and install icons retain
their existing handling.

## Validation

* The four PNGs measure 127457–137498 bytes, below the 300000-byte limit. Their eight-character
  SHA-256 hashes match the committed JSON and metadata URLs.
* Unit tests compare the exact page set, PNG directory, hash manifest, actual PNG dimensions and
  bytes, metadata selection, and unknown query rejection. The native file exclusion list is compared
  to the same actual PNG directory.
* Web SSR tests render all four sets of Open Graph and Twitter tags without hydration.
* Eight live harness tests verify real font/texture decoding, card geometry, no viewport overflow,
  identical screenshots under light and dark preferences, and invalid-query responses.
* Release web build: 40 modulepreloads; eagerly loaded startup/error union 486347/525000 bytes.
* Native static build: 28 modulepreloads; stripped export 6210679/7000000 bytes; native social-tag
  and route boundary checks passed. This is a compiled bundle check.

No messaging or scraper-debugger submissions were performed. The committed metadata and PNG
responses are the validation surface; external preview caches can update after deployment.

The home-image substitution negative control forced `SocialCard` to select `/` for every page. All
four new SSR cases failed, and the component was restored. The unchanged component passed those
cases. Full Browserless results: 4385 app tests, 45 web SSR tests, 277 asset tests, 23 store-drawing
tests, and 42 API smoke checks passed. After correcting nested-path fixtures, all 6647
repository-tool tests passed. Quality passed all 14 checks.

Independent Claude review found no blocking defects and identified a stale-render guard gap. The
generator now records a separate input-provenance digest only after all four captures succeed; the
eight-character PNG URL hash map is unchanged. The digest covers the current visual inputs,
including names, size, recipe, components, mark, texture, global styles, tokens, palette and fonts.
It detects changed inputs since generation, rather than proving universal pixel equivalence. Actual
name and title-size source edits each made the provenance guard fail, and the restored files passed.
Regeneration preserved all four PNGs byte-for-byte. The two touched oversized fixture file caps were
lowered to their measured sizes, 1391 and 837 lines.
