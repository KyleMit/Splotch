// Android and iOS cannot register the WOFF2 files the shipping font package carries,
// and no TTF is bundled, so native text resolves the family to the system font.
export function loadShippingFont() {}
