// Durations for the motion JavaScript drives. A `transition:` directive takes a
// millisecond count, so these cannot be `var(--duration-*)` tokens the way every
// CSS cue's timing is — and reduce-motion.spec.ts asserts both, which is why
// they live in a module with no imports of its own: a spec runs under Node,
// where a module that reaches for $app or $lib cannot be loaded.

// Reveal timing for every conditional block a settings section owns. The
// exception is the shared feedback field set, ReportFields: it is also hosted by
// /feedback, outside Settings, so its nested device reveals name their own
// shorter duration locally.
export const SECTION_SLIDE_MS = 220;

// The reduced-motion answer for a JS reveal: long enough to read as an
// appearance rather than a cut, short enough that the content is there by the
// time a parent looks.
export const CALM_FADE_MS = 150;

// A flyout menu's exit on close: well under its entrance, since the pick has
// already landed and the menu only has to get out of the way.
export const FLYOUT_EXIT_MS = 120;
