# Native AI output admission repair

This is the same owner's bounded repair of private candidate
643e3e7663a7732089c2acdd32b95370ebbf212a. Its original evidence packet and first failures are
preserved. A controlled fixture demonstrated that all three signature-only bodies were accepted as
image replies: an eight-byte PNG, a three-byte JPEG and a twelve-byte WebP. Those are invalid
pictures, not acceptable provider fixtures.

## Admission before storage and presentation

Response collection remains bounded to the existing result byte limit. Admission also bounds each
dimension, total pixels, decoded bytes, metadata, chunk/segment counts, elapsed work and synchronous
work slices. The JavaScript parser reuses the maintained native PNG inflater and cooperative work
owner. No server image library or new dependency enters the native application.

PNG admission requires a complete CRC-checked chunk sequence, one supported IHDR, consecutive IDAT,
one final IEND and no trailing bytes. The zlib stream, decompressed byte count, Adler checksum and
scanline filters are checked. The supported forms are noninterlaced eight-bit RGB and RGBA with a
finite set of bounded metadata. Indexed, grayscale, sixteen-bit, interlaced, animated and unknown
metadata forms fail closed; compressed text and color profiles are not accepted by this PNG owner.

JPEG admission supports eight-bit baseline sequential grayscale and three-component images with
bounded sampling. It validates complete quantization and canonical Huffman tables, the single
interleaved scan, every encoded coefficient block, byte stuffing, restart order, padding and final
EOI. Progressive, arithmetic, multiscan, CMYK, unsupported sampling and trailing data fail closed.
Decoding the entropy structure does not by itself reconstruct the final native bitmap.

WebP admission validates the exact RIFF envelope, padding, finite chunk order, single still frame,
bounded VP8/VP8L dimensions, frame partition envelope, optional alpha and bounded declared metadata.
Animation, inconsistent flags/canvas, duplicate or unknown chunks and trailing data fail closed.
JavaScript does not claim to decode the compressed VP8/VP8L pixel stream. Successful full native
decoding is mandatory for WebP and every other admitted format.

The controller calls the native admission boundary before retaining bytes or constructing any image
URI, including an in-memory fallback or a late result. The storage adapter independently admits
bytes before publication and rechecks saved results before returning a recovered journal or gallery
picture. Previously saved invalid bytes remain on disk for recovery investigation and are not
returned for rendering. Failure does not upload or automatically fund another generation.

The Android source checks bounds before allocation, then uses a software `ImageDecoder` bitmap with
partial-image rejection on API 28 and above. The existing application floor remains API 24. On API
24–27, the fully structurally decoded PNG/JPEG forms additionally require a complete bounded
`BitmapFactory` bitmap. WebP fails closed there because this implementation does not establish
strict partial-image rejection on the older decoder. No API-floor change or weaker WebP fallback is
introduced. Bitmap dimensions, configuration and allocation are checked and the bitmap is recycled.

The iOS source requires a single complete ImageIO source with matching MIME and dimensions,
immediate full image decoding, a bounded RGBA bitmap draw and a complete image status after drawing.
The bridge returns only exact decoded dimensions. Missing, failed, timed-out, partial or mismatched
decoder responses cannot enable presentation or retention.

These are implemented source gates. Native compilation, decoder registration, corrupt-input
behavior, memory use and responsiveness on both operating systems remain unqualified. Per-image
bounds are not a proof of aggregate controller lifetime or shared Parent Center permission behavior.
Those campaign gates remain open, as do physical/optimized qualification and independent review.

Controlled local fixtures exercise real encoded RGB/RGBA PNG, grayscale/baseline JPEG, and
lossy/lossless/alpha WebP bytes, including complete 1024 by 768 examples. The fixture encoder and
independent decoding check use Sharp only in tooling tests. The native application imports neither
Sharp nor server code. Mounted RN and RSD production callers reject a failed native admission
without publishing a result or replacing the drawing. Real hosted route fixtures use valid PNG bytes
and never call a provider.

Ten deliberate controls remove CRC checking, JPEG completion, the WebP envelope, the pixel bound,
native dimension agreement, controller admission, storage admission, gallery admission, and each OS
source bound in turn. Each produces an assertion failure and restores exact source bytes. The OS
controls prove drift guards, not native runtime behavior. Required scoped source checks and their
first faults are retained in the separate repair evidence packet; the original packet is unchanged.

Primary API references:

* [Apple immediate image decoding](https://developer.apple.com/documentation/imageio/kcgimagesourceshouldcacheimmediately)
* [Apple source and image completion status](https://developer.apple.com/documentation/imageio/cgimagesourcestatus)
* [Android ImageDecoder](https://developer.android.com/reference/android/graphics/ImageDecoder)
* [Android partial-image rejection](https://developer.android.com/reference/android/graphics/ImageDecoder.OnPartialImageListener)
* [Android BitmapFactory options](https://developer.android.com/reference/android/graphics/BitmapFactory.Options)

## Proposed delivery recovery contract

This section proposes a future client/server contract. It does not change a hosted route, production
API, job retention policy or charge behavior.

The current collection route deletes a delivered job before the client confirms durable local
storage. A process death after receipt but before confirmed publication can therefore lose the
generated picture even though the original drawing and recovery intent were saved. Client-side
ordering alone cannot eliminate that gap. Keeping bytes in memory, checking a write, or making a
second request after server deletion does not establish crash recovery.

1. Before submission, the client durably records a cryptographically random attempt identifier,
   original drawing reference, style and request digest. Credentials remain solely in the secure
   owner. The server binds the attempt to the authenticated funding identity and exact request
   digest. Atomic reservation produces one stable job identifier before any provider start. An
   identical attempt resolves to that job; a changed request under the identifier returns conflict.
   Grant reservation and provider start are not repeated by reconciliation.
2. A read-only authenticated lookup by attempt identifier recovers a lost start ticket. It never
   starts a model call. A missing or unavailable lookup remains uncertain; it does not authorize an
   automatic paid retry. Any future replay of a generation POST still needs the product's explicit
   parent authorization and the server's idempotent start contract.
3. Collection is nondestructive until acknowledgement or expiry. Every successful collection returns
   the same immutable bytes, MIME, content digest and delivery receipt bound to the job and funding
   identity. Repeated collection cannot charge another generation or change the successful grant
   count. The server retention deadline is explicit in the ticket and receipt.
4. The client validates structure and full native decode, writes a private temporary result, checks
   its full digest, publishes it atomically and records the result reference plus receipt in a
   durable recovery journal. A specified native durability fence for both file and journal is
   required; Expo readback and rename alone are not claimed to prove persistence across process or
   power loss. Recovery verifies the file/digest before exposing the picture.
5. Only after that durable commit does an authenticated acknowledgement submit the delivery receipt
   and digest. Acknowledgement is idempotent and never funds a model call. The server records a
   durable acknowledgement tombstone before deleting result bytes; repeated acknowledgements return
   the same terminal outcome. Recovery can repeat this housekeeping operation from the journal.
6. A lost acknowledgement response is resolved by that tombstone, rather than being confused with an
   expired or never-existing job. Before acknowledgement, process death is recovered by the stable
   ticket and repeated nondestructive collection. After durable acknowledgement, it is recovered
   from the verified local result.

Expiry still limits the guarantee. A client absent beyond the agreed retention deadline may lose an
uncollected result; its original drawing remains recoverable. Whether the retention window starts at
submission or readiness, and how it relates to privacy deletion and allowance settlement, needs an
explicit product/API decision. No indefinite retention, automatic refund or duplicate funded retry
is implied. The proposed schema, authorization bindings, durability fence and fault tests must be
reviewed together before changing the production API.
