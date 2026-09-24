// The APG radio-group pattern's keyboard half: arrow keys move focus *and*
// selection, wrapping past either end and skipping disabled options.

export function arrowDelta(key: string): -1 | 0 | 1 {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  return 0;
}

export function nextEnabledIndex(
  options: readonly { disabled?: boolean }[],
  from: number,
  delta: -1 | 1
): number {
  let next = from;
  do {
    next = (next + delta + options.length) % options.length;
  } while (options[next].disabled && next !== from);
  return next;
}

// The group is one tab stop. The selected option carries it — or the first
// enabled one while nothing is selected.
export function rovingTabIndex<T>(
  options: readonly { value: T; disabled?: boolean }[],
  isSelected: (value: T) => boolean
): number {
  const selectedIndex = options.findIndex((option) => !option.disabled && isSelected(option.value));
  return selectedIndex !== -1 ? selectedIndex : options.findIndex((option) => !option.disabled);
}
