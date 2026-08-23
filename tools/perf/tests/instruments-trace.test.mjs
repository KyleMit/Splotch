import { describe, expect, it } from 'vitest';
import { countBy, parseRows, summarizeDurations } from '../lib/instruments-trace.mjs';

// Instruments interns repeated values: the first occurrence of a value carries
// `id="N"` and the text, every later occurrence is `<tag ref="N"/>` with no text.
// A parser that ignores that reads most columns as empty — which looks like a
// trace with no data rather than like a parsing bug.
const XML = `
<node>
  <schema><mnemonic>duration</mnemonic><mnemonic>process</mnemonic></schema>
  <row><duration id="1">1500000</duration><process id="2">WebContent</process></row>
  <row><duration id="3">3000000</duration><process ref="2"/></row>
  <row><duration ref="1"/><process id="4">GPU</process></row>
</node>`;

describe('parseRows', () => {
  it('resolves an interned ref back to the value it points at', () => {
    const { rows } = parseRows(XML);

    expect(rows[1].process).toBe('WebContent');
    expect(rows[2].duration).toBe('1500000');
  });

  it('reads column names from the schema', () => {
    expect(parseRows(XML).columns).toEqual(['duration', 'process']);
  });

  it('returns empty structures for missing input rather than throwing', () => {
    expect(parseRows(null)).toEqual({ columns: [], rows: [] });
  });
});

describe('summarizeDurations', () => {
  it('converts nanoseconds to milliseconds', () => {
    const { rows } = parseRows(XML);
    const summary = summarizeDurations(rows);

    expect(summary.n).toBe(3);
    expect(summary.p50).toBe(1.5);
    expect(summary.max).toBe(3);
  });

  it('is null when nothing parsed as a number', () => {
    expect(summarizeDurations([{ duration: 'n/a' }])).toBeNull();
  });
});

describe('countBy', () => {
  it('tallies a column, which is how a symbol table becomes a ranking', () => {
    expect(countBy(parseRows(XML).rows, 'process')).toEqual({ WebContent: 2, GPU: 1 });
  });
});
