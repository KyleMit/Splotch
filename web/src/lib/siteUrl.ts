// The canonical public origin. The other copies live across bundle boundaries:
// app.html's Open Graph tags and securityPolicy.ts's build-side native API
// origin. siteUrl.test.ts fails when they disagree.
//
// Needed because the beta sign-up page prints the feedback form's address in
// full rather than hiding it behind link text: it can be read on one device and
// acted on from another, so the address has to be copyable and typeable, not
// only clickable. A link that only has to be followed stays a relative path,
// so deploy previews and localhost link to themselves.
export const SITE_ORIGIN = 'https://splotch.art';
export const FEEDBACK_URL = `${SITE_ORIGIN}/feedback`;
