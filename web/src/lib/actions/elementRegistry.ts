import type { ActionReturn } from 'svelte/action';

// Collect the elements of a keyed list into a plain lookup table the component
// reads imperatively — the nav rows and section wrappers a scrollspy measures,
// the option buttons a roving-focus picker moves between.
//
// `bind:this={table[key]}` expresses the same thing and is what this replaces.
// Svelte 5 warns `binding_property_non_reactive` for every such binding, once
// per list item, because the target is not `$state` — and for these tables that
// is the point: nothing renders from them, so making them reactive would buy a
// re-render per element that arrives. Eleven rows plus eleven sections put 40+
// warnings in the console on a single Settings open, which is enough noise to
// hide a real one.
//
// The parameter is a setter rather than the table and key, so a caller keeps
// whatever shape its own table has (`Record<SectionId, …>`, a sparse array) and
// the types stay the caller's. It is read once on mount and on teardown; an
// inline arrow that changes identity every render is therefore fine, and is the
// expected way to call this.
type Register = (element: HTMLElement | undefined) => void;

// Declared as a plain function returning `ActionReturn` rather than typed with
// `Action`, which widens the return to `void | ActionReturn` and leaves callers
// (a test reaching for `destroy`) unable to see the teardown it always has.
export function registerElement(node: HTMLElement, assign: Register): ActionReturn<Register> {
  assign(node);
  return {
    destroy: () => assign(undefined),
  };
}
