// Netlify Blobs status is unknown until the first real read proves otherwise —
// assume persistent so the "Blobs unavailable" banner doesn't flash on load.
export const ASSUME_PERSISTENT = true;

export const mutationMessage = (verb: 'Added' | 'Removed', token: string) => `${verb} “${token}”`;
