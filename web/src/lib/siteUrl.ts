// The canonical public origin. Everywhere else the site's own address appears,
// it is a literal in a file this module cannot import — app.html's Open Graph
// tags and vite.config.ts's native API base — so siteUrl.test.ts reads those and
// fails when they disagree.
//
// Needed because /android-beta prints the feedback form's address in full rather
// than hiding it behind link text: that page is read on one device and often
// acted on from another, so the address has to be copyable and typeable, not
// only clickable. A link that only has to be followed stays a relative path, so
// deploy previews and localhost link to themselves.
export const SITE_ORIGIN = 'https://splotch.art';
