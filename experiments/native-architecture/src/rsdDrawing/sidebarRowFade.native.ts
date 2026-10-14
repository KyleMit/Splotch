// React Strict DOM runs a native `color` transition through Animated and hands the row's label the
// animated value as its inherited ink, which a nested text cannot paint, so both rows a section
// change touched turned black. A native row takes its new wash and ink at once.
export const sidebarRowFade = { row: null } as const;
