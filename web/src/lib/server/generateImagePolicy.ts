// A drawing screenshot is well under a megabyte; cap the upload so a valid-token
// holder can't push us into a memory/DoS situation by base64-ing a huge blob.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
