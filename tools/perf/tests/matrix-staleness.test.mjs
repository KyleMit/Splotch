import { describe, expect, it } from 'vitest';
import {
  MEASURED_SURFACE,
  ageReportRows,
  assessManifest,
  implicitBaseWarning,
  provenanceOutcome,
  sectionProvenance,
} from '../check-matrix-staleness.mjs';

const DATES = { drawing: '2026-09-20', undo: '2026-09-20', actions: '2026-09-01' };

const captured = (commit, capturedOn = DATES) => ({
  id: 'portrait-light',
  status: 'captured',
  capturedOn,
  drawing: { pen: ['a.json'] },
  drawingProductCommit: commit,
  undoSource: 'a.json',
  actionSources: [{ source: 'x.json', productCommit: commit, kind: 'full' }],
});

const manifestOf = (modes) => ({ targets: [{ id: 't', modes }] });

const assess = (manifest, { published = null, reachable = () => true } = {}) =>
  assessManifest(manifest, {
    publishedModeFor: () => published,
    today: '2026-09-25',
    isReachable: reachable,
  });

describe('sectionProvenance', () => {
  it('reports drawing, undo, and action sections with their own commits', () => {
    const mode = {
      ...captured('aaa'),
      undoProductCommit: 'bbb',
      actionSources: [{ source: 'x', productCommit: 'ccc' }],
    };

    expect(sectionProvenance(mode, null)).toEqual([
      { section: 'drawing', state: 'captured', capturedOn: '2026-09-20', commits: ['aaa'] },
      { section: 'undo', state: 'captured', capturedOn: '2026-09-20', commits: ['bbb'] },
      { section: 'actions', state: 'captured', capturedOn: '2026-09-01', commits: ['ccc'] },
    ]);
  });

  // Under ADR-0159 a preserved section was exempt from the currency check. Age
  // applies to it as much as to anything: an old section is exactly what a
  // reader needs to see, so it is reported with the commits it was published at.
  it('reads a preserved section commit from the report it is carried from', () => {
    const mode = {
      ...captured('aaa'),
      drawing: 'preserved',
      undoSource: 'preserved',
      actionSources: 'preserved',
    };
    const published = {
      drawing: { pen: { runs: [{ productCommit: 'old1' }] } },
      undo: { productCommit: 'old2' },
      actions: { sources: [{ productCommit: 'old3' }, { productCommit: 'old3' }] },
    };

    expect(
      sectionProvenance(mode, published).map(({ state, commits }) => [state, commits])
    ).toEqual([
      ['preserved', ['old1']],
      ['preserved', ['old2']],
      ['preserved', ['old3']],
    ]);
  });

  it('dates captured-untracked actions by their pinned commit', () => {
    const mode = {
      ...captured('aaa'),
      actionSources: 'captured-untracked',
      actionProductCommit: 'bbb',
    };

    expect(sectionProvenance(mode, null).at(-1)).toMatchObject({
      state: 'captured-untracked',
      commits: ['bbb'],
    });
  });

  it('omits an action section the mode records as unavailable', () => {
    const mode = { ...captured('aaa'), actionSources: undefined, actionsUnavailableReason: 'P1' };

    expect(sectionProvenance(mode, null).map(({ section }) => section)).toEqual([
      'drawing',
      'undo',
    ]);
  });

  it('has no sections for a mode that was not captured', () => {
    expect(sectionProvenance({ status: 'unavailable', reason: 'offline' }, null)).toEqual([]);
  });
});

describe('assessManifest', () => {
  it('ages every section against today', () => {
    const [drawing, , actions] = assess(manifestOf([captured('aaa')]));

    expect(drawing).toMatchObject({
      target: 't',
      mode: 'portrait-light',
      ageDays: 5,
      problems: [],
    });
    expect(actions).toMatchObject({ ageDays: 24, problems: [] });
  });

  it('names a section with no date, a malformed date, or no commit', () => {
    const mode = {
      ...captured('aaa', { drawing: '2026-9-20', undo: '2026-09-20' }),
      actionSources: [{ source: 'x.json', kind: 'full' }],
    };

    expect(assess(manifestOf([mode])).map(({ section, problems }) => [section, problems])).toEqual([
      ['drawing', ['capturedOn 2026-9-20 is not YYYY-MM-DD']],
      ['undo', []],
      ['actions', ['no capturedOn date', 'no product commit']],
    ]);
  });

  // Unreachable is not provenance: a shallow clone makes every lookup fail, and
  // a commit nobody can resolve cannot say how much has landed on top of it.
  it('names a section whose commit this checkout cannot resolve', () => {
    const [drawing] = assess(manifestOf([captured('deadbeefcafe0000')]), {
      reachable: () => false,
    });

    expect(drawing.problems).toEqual(['commit deadbeefcafe is unreachable']);
  });

  it('marks a preserved section with no published report as missing its commit', () => {
    const mode = { ...captured('aaa'), actionSources: 'preserved' };

    expect(assess(manifestOf([mode])).at(-1).problems).toEqual(['no product commit']);
  });
});

describe('ageReportRows', () => {
  const commitsSince = (commit, pathspec) => (pathspec === MEASURED_SURFACE ? 40 : 3);

  it('groups a target section shared across modes and ranks the oldest first', () => {
    const sections = assess(
      manifestOf([captured('aaa'), { ...captured('aaa'), id: 'portrait-dark' }])
    );

    const rows = ageReportRows(sections, { commitsSince });

    expect(rows.map((row) => [row.section, row.modes, row['age (days)']])).toEqual([
      ['actions', 'portrait-light, portrait-dark', 24],
      ['drawing', 'portrait-light, portrait-dark', 5],
      ['undo', 'portrait-light, portrait-dark', 5],
    ]);
    expect(rows[0]).toMatchObject({ 'engine commits since': 3, 'product commits since': 40 });
  });

  it('ranks an undated section ahead of every dated one', () => {
    const mode = captured('aaa', { drawing: '2026-09-20', undo: '2026-09-20' });

    const [first] = ageReportRows(assess(manifestOf([mode])), { commitsSince });

    expect(first).toMatchObject({ section: 'actions', capturedOn: '(undated)', 'age (days)': '?' });
  });
});

describe('the measured surface', () => {
  it('includes source, static assets, and the lockfile', () => {
    expect(MEASURED_SURFACE).toEqual(expect.arrayContaining(['web/src', 'web/static']));
    expect(MEASURED_SURFACE).toContain('pnpm-lock.yaml');
  });

  it('excludes specs and package.json, which move without changing the product', () => {
    expect(MEASURED_SURFACE).not.toContain('web/tests');
    expect(MEASURED_SURFACE).not.toContain('package.json');
  });
});

describe('implicitBaseWarning', () => {
  const sha = (char) => char.repeat(40);

  it('fires when --base was not passed and HEAD carries commits origin/main lacks', () => {
    expect(
      implicitBaseWarning({ explicitBase: false, headSha: sha('a'), mergeBaseSha: sha('b') })
    ).toContain('--base=origin/main');
  });

  it('stays silent under an explicit --base, --base=HEAD included', () => {
    expect(
      implicitBaseWarning({ explicitBase: true, headSha: sha('a'), mergeBaseSha: sha('b') })
    ).toBeNull();
  });

  it('stays silent when HEAD sits at the origin/main branch point', () => {
    expect(
      implicitBaseWarning({ explicitBase: false, headSha: sha('a'), mergeBaseSha: sha('a') })
    ).toBeNull();
  });

  it('stays silent when origin/main cannot be resolved', () => {
    expect(
      implicitBaseWarning({ explicitBase: false, headSha: sha('a'), mergeBaseSha: null })
    ).toBeNull();
  });
});

describe('provenanceOutcome', () => {
  // ADR-0175: a section is never failed for being old. Between campaigns every
  // section is behind the tip; its age is reported and its red keeps counting.
  it('reports an old but fully dated section without failing, even under --strict', () => {
    const sections = assess(manifestOf([captured('aaa')]));

    const outcome = provenanceOutcome({ sections, strict: true });

    expect(outcome.failed).toBe(false);
    expect(outcome.lines.join('\n')).toContain('was captured 2026-09-01 (24 days ago)');
  });

  it('warns about incomplete provenance by default without failing', () => {
    const sections = assess(manifestOf([captured('aaa', {})]));

    const outcome = provenanceOutcome({ sections, strict: false });

    expect(outcome.failed).toBe(false);
    expect(outcome.lines[0]).toMatch(/^WARN {2}3 captured section\(s\) lack complete provenance/);
  });

  it('fails incomplete provenance under --strict and names every section', () => {
    const sections = assess(
      manifestOf([captured('aaa', {}), { ...captured('aaa', {}), id: 'portrait-dark' }])
    );

    const outcome = provenanceOutcome({ sections, strict: true });

    expect(outcome.failed).toBe(true);
    expect(outcome.lines[0]).toContain(
      't/drawing [portrait-light, portrait-dark] (no capturedOn date)'
    );
    expect(outcome.lines.at(-1)).toContain('--strict asserts provenance-complete');
  });
});
