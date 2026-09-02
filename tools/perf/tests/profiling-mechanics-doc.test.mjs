import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN_TARGETS, actionsTransportFor } from '../lib/campaign-plan.mjs';

// docs/PROFILING-MECHANICS.md's target table restates, in prose, facts that
// `CAMPAIGN_TARGETS` owns: which transport draws a target, which one drives its
// actions, which runtime's input-fidelity expectations judge it, and which
// refresh regime scores it. Prose cannot maintain that agreement — a target
// moved between transports is exactly the kind of change that lands in the
// module and never in the doc, and the doc's whole reason to exist is that
// someone consults it when choosing a transport. A stale row there sends them
// to a path that cannot produce a scoreable cell.
//
// So the agreement is mechanical, in the spirit of web/src/app.html.test.ts:
// add a target, retire one, or move one between transports without editing the
// table and this fails, naming the row.
//
// What it deliberately does NOT police: everything else in that document. The
// transport descriptions, the ruled-out drivers and the glossary are judgements
// and history, with no declaration to check them against — a test that pretended
// otherwise would be asserting its own copy of the prose.
const repoRoot = join(import.meta.dirname, '..', '..', '..');
const doc = join(repoRoot, 'docs', 'PROFILING-MECHANICS.md');

const HEADING = '## Which transport drives which target';

function tableRows() {
  const text = readFileSync(doc, 'utf8');
  const start = text.indexOf(HEADING);
  if (start === -1) throw new Error(`${doc} has no "${HEADING}" section`);
  const body = text.slice(start + HEADING.length);
  const end = body.indexOf('\n## ');
  const section = end === -1 ? body : body.slice(0, end);

  const rows = new Map();
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    // The header and its separator are the two non-data rows a pipe table
    // carries; a data row is identified by its first cell being a code span,
    // which the header ("Target") and separator ("------") are not.
    const id = /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1];
    if (!id) continue;
    if (rows.has(id)) throw new Error(`${doc} lists ${id} twice`);
    const [, label, drawing, actions, runtime, regime] = cells;
    rows.set(id, {
      label,
      drawing: unquote(drawing),
      actions: unquote(actions),
      captureRuntime: unquote(runtime),
      refreshRegime: unquote(regime),
    });
  }
  return rows;
}

function unquote(cell) {
  return /^`([^`]+)`$/.exec(cell ?? '')?.[1] ?? cell;
}

describe('docs/PROFILING-MECHANICS.md target table', () => {
  const rows = tableRows();

  it('lists exactly the campaign targets', () => {
    expect([...rows.keys()].sort()).toEqual(Object.keys(CAMPAIGN_TARGETS).sort());
  });

  for (const [id, target] of Object.entries(CAMPAIGN_TARGETS)) {
    it(`states ${id} as campaign-plan.mjs declares it`, () => {
      expect(rows.get(id)).toEqual({
        label: target.label,
        drawing: target.transport,
        // Through the resolver `planCampaign` itself calls, so a changed
        // fallback fails this table rather than passing it (the PR 1548 review:
        // a private copy of the default here kept the guard green whatever
        // production chose).
        actions: actionsTransportFor(target),
        captureRuntime: target.captureRuntime,
        // A target with no established regime declares null, and the doc has to
        // say so rather than leaving the cell to read as an omission.
        refreshRegime: target.refreshRegime ?? 'none',
      });
    });
  }
});
