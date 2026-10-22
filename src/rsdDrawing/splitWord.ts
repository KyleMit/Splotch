// Whether native text layout broke a word across lines: the laid-out lines' words differ from the
// text's own. Whole-word wrapping keeps every word intact; an empty report says nothing yet.
export function hasSplitWord(text: string, lines: readonly { text: string }[]) {
  if (lines.length === 0) return false;
  const words = (value: string) => value.split(/\s+/).filter(Boolean);
  const expected = words(text);
  const actual = lines.flatMap((line) => words(line.text));
  return (
    actual.length !== expected.length || actual.some((word, index) => word !== expected[index])
  );
}
