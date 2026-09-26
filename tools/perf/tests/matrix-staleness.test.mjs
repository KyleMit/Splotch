import { describe, expect, it } from 'vitest';
import {
  MEASURED_SURFACE,
  ageReportRows,
  assessManifest,
  implicitBaseWarning,
  overdueReleaseGateSections,
  provenanceOutcome,
  sectionProvenance,
} from '../check-matrix-staleness.mjs';
import { RELEASE_GATE_MAX_AGE_DAYS } from '../lib/capture-date.mjs';

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

const manifestOf = (modes, deviceKind = 'physical') => ({
  targets: [{ id: 't', deviceKind, modes }],
});

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

  // The generator copies a captured-untracked section from the published report,
  // so the commit it shows is the one that gets aged, not the manifest's pin.
  it('reads a captured-untracked section commit from the published report', () => {
    const mode = { ...captured('aaa'), drawing: 'captured-untracked' };
    const published = { drawing: { pen: { runs: [{ productCommit: 'aaa' }] } } };

    expect(sectionProvenance(mode, published)[0]).toEqual({
      section: 'drawing',
      state: 'captured-untracked',
      capturedOn: '2026-09-20',
      commits: ['aaa'],
    });
  });

  it('names a captured-untracked pin the published section contradicts', () => {
    const mode = { ...captured('pinned1'), drawing: 'captured-untracked' };
    const published = { drawing: { pen: { runs: [{ productCommit: 'shown2' }] } } };

    const [drawing] = assess(manifestOf([mode]), { published });

    expect(drawing.commits).toEqual(['shown2']);
    expect(drawing.problems).toEqual([
      'manifest pins pinned1 but the published section carries shown2',
    ]);
  });

  // The generator publishes a declared action section even beside an
  // actionsUnavailableReason, so the check must date it too.
  it('checks a declared action section even beside an unavailable reason', () => {
    const mode = {
      ...captured('aaa', { drawing: '2026-09-20', undo: '2026-09-20' }),
      actionsUnavailableReason: 'P1',
    };

    expect(assess(manifestOf([mode])).at(-1)).toMatchObject({
      section: 'actions',
      problems: ['no capturedOn date'],
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
  // ADR-0175: --strict never fails a section for being old. Between campaigns
  // every section is behind the tip; its age is reported and its red keeps
  // counting. Only --release-gate-age fails on age.
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

// Issue 2347's ruling (ADR-0175, as amended): a campaign may finish only when
// every release-gate section is at most RELEASE_GATE_MAX_AGE_DAYS old. The
// fixtures' today is fixed at 2026-09-25, so the boundary never moves with the
// calendar.
describe('release-gate age limit', () => {
  const datedAll = (date) => ({ drawing: date, undo: date, actions: date });
  const atLimit = datedAll('2026-09-11');
  const pastLimit = datedAll('2026-09-10');

  it('pins the limit the maintainer ruled', () => {
    expect(RELEASE_GATE_MAX_AGE_DAYS).toBe(14);
  });

  it('passes a release-gate section exactly at the limit', () => {
    const sections = assess(manifestOf([captured('aaa', atLimit)]));

    expect(sections.map(({ ageDays }) => ageDays)).toEqual([14, 14, 14]);
    expect(overdueReleaseGateSections(sections)).toEqual([]);
    expect(provenanceOutcome({ sections, strict: true, releaseGateAge: true })).toMatchObject({
      failed: false,
      overdue: [],
    });
  });

  it('warns by default about a release-gate section one day past the limit', () => {
    const sections = assess(manifestOf([captured('aaa', pastLimit)]));

    const outcome = provenanceOutcome({ sections, strict: true });

    expect(outcome.failed).toBe(false);
    expect(outcome.overdue.map(({ section, ageDays }) => [section, ageDays])).toEqual([
      ['drawing', 15],
      ['undo', 15],
      ['actions', 15],
    ]);
    expect(outcome.lines.find((line) => line.includes('release-gate section(s)'))).toMatch(
      /^WARN {2}3 release-gate section\(s\) are older than 14 days: t\/drawing \[portrait-light\] \(captured 2026-09-10, 15 days old\)/
    );
  });

  it('fails a release-gate section past the limit under --release-gate-age', () => {
    const sections = assess(
      manifestOf([
        captured('aaa', pastLimit),
        { ...captured('aaa', pastLimit), id: 'portrait-dark' },
      ])
    );

    const outcome = provenanceOutcome({ sections, strict: false, releaseGateAge: true });

    expect(outcome.failed).toBe(true);
    expect(outcome.lines.join('\n')).toContain(
      'FAIL  6 release-gate section(s) are older than 14 days: t/drawing [portrait-light, portrait-dark] (captured 2026-09-10, 15 days old)'
    );
    expect(outcome.lines.at(-1)).toContain('--release-gate-age asserts');
  });

  it('fails an undated release-gate section under --release-gate-age', () => {
    const sections = assess(manifestOf([captured('aaa', { ...atLimit, actions: undefined })]));

    const outcome = provenanceOutcome({ sections, strict: false, releaseGateAge: true });

    expect(outcome.failed).toBe(true);
    expect(outcome.overdue.map(({ section }) => section)).toEqual(['actions']);
    expect(outcome.lines.join('\n')).toContain(
      't/actions [portrait-light] (captured (undated), age unknown)'
    );
  });

  it.each(['desktop', 'simulator', 'emulator'])(
    'never flags an old %s section, which is not a release-gate row',
    (deviceKind) => {
      const sections = assess(manifestOf([captured('aaa', datedAll('2026-07-01'))], deviceKind));

      const outcome = provenanceOutcome({ sections, strict: true, releaseGateAge: true });

      expect(sections[0].ageDays).toBe(86);
      expect(outcome).toMatchObject({ failed: false, overdue: [] });
      expect(outcome.lines.join('\n')).not.toContain('release-gate section(s)');
    }
  );
});
