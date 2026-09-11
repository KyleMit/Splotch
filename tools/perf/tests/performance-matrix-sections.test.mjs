import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { renderReport, targetRole } from '../gen-performance-matrix.mjs';

const MATRIX = join(ROOT, 'scrapbook', 'performance', '2026-07-31-deployment-target-matrix');
const published = () => JSON.parse(readFileSync(join(MATRIX, 'data.json'), 'utf8'));

// ADR-0156 decisions 1–3, spelled out per committed target: a new target, or a
// deviceKind edit on an existing one, fails here until its role is decided.
const EXPECTED_ROLES = {
  'ipad-device-web': 'release-gate',
  'ipad-device-native': 'release-gate',
  'ipad-simulator-web': 'advisory',
  'ipad-simulator-native': 'advisory',
  'android-device-web': 'release-gate',
  'android-device-native': 'release-gate',
  'android-emulator-web': 'advisory',
  'android-emulator-native': 'advisory',
  'mac-chrome': 'regression-tripwire',
  'mac-safari': 'regression-tripwire',
  'mac-firefox': 'regression-tripwire',
};

const ROLE_ORDER = ['release-gate', 'regression-tripwire', 'advisory'];

describe('targetRole', () => {
  it('assigns every committed target the ADR-0156 role for its hardware', () => {
    const roles = Object.fromEntries(
      published().targets.map((target) => [target.id, targetRole(target)])
    );

    expect(roles).toEqual(EXPECTED_ROLES);
  });

  it('keeps release-gate rows whose fidelity class is advisory', () => {
    const gateFidelities = published()
      .targets.filter((target) => targetRole(target) === 'release-gate')
      .map((target) => target.fidelity);

    expect(gateFidelities).toContain('physical-safari-gated');
    expect(gateFidelities).toContain('physical-native-advisory');
    expect(gateFidelities).toContain('physical-web-advisory');
  });

  it('refuses a device kind ADR-0156 assigns no role', () => {
    expect(() => targetRole({ id: 'cloud-box', deviceKind: 'cloud' })).toThrow(
      'Target cloud-box declares deviceKind "cloud", which ADR-0156 assigns no release role.'
    );
    expect(() => targetRole({ id: 'proto', deviceKind: 'constructor' })).toThrow(
      'assigns no release role'
    );
  });
});

describe('the published matrix page', () => {
  const html = renderReport(published());
  const sections = {
    overview: html.slice(html.indexOf('<div class="mx">'), html.indexOf('id="actions"')),
    heatmap: html.slice(
      html.indexOf('<div class="heat-scroll"'),
      html.indexOf('class="action-key"')
    ),
  };

  describe.each(Object.entries(sections))('%s', (_, section) => {
    it('lists targets gate first, then tripwire, then advisory', () => {
      const roles = [...section.matchAll(/data-target-header="([^"]+)"/g)].map(
        ([, id]) => EXPECTED_ROLES[id]
      );

      expect(roles).toHaveLength(Object.keys(EXPECTED_ROLES).length);
      expect(roles).toEqual(
        [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
      );
    });

    it('renders the four release-gate rows in an open section that states the gate rule', () => {
      const primary = section.match(
        /<div class="role role-primary" data-role="release-gate">([\s\S]*?)<details/
      )?.[1];
      const headers = [...primary.matchAll(/data-target-header="([^"]+)"/g)].map(([, id]) => id);

      expect(headers).toEqual([
        'ipad-device-web',
        'ipad-device-native',
        'android-device-web',
        'android-device-native',
      ]);
      expect(primary).toContain('4 targets · 16 modes');
      expect(primary).toContain(
        'a cell an uncalibrated instrument cannot score counts as red here, not as absent'
      );
    });

    it('folds each non-gate role into a closed disclosure whose summary states its rule', () => {
      const folds = [
        ...section.matchAll(
          /<details class="role role-fold" data-role="([^"]+)"><summary class="role-head">([\s\S]*?)<\/summary>/g
        ),
      ].map(([, role, summary]) => ({ role, summary }));

      expect(folds.map(({ role }) => role)).toEqual(['regression-tripwire', 'advisory']);
      expect(folds[0].summary).toContain('3 targets · 12 modes');
      expect(folds[0].summary).toContain(
        'turns red on a change that was green on main is a finding to attribute before shipping'
      );
      expect(folds[1].summary).toContain('4 targets · 16 modes');
      expect(folds[1].summary).toContain('never fail or approve a release');
      expect(section).not.toMatch(/<details[^>]*\sopen[\s>]/);
    });
  });

  it('chips calibration on release-gate rows only', () => {
    const chips = [
      ...sections.overview.matchAll(
        /data-target-header="([^"]+)"[^]*?<b>[^<]*<\/b>(?:<span class="matrix-chip (trusted|waiting)")?/g
      ),
    ].map(([, id, chip]) => [id, chip ?? null]);

    expect(Object.fromEntries(chips)).toEqual({
      'ipad-device-web': 'trusted',
      'ipad-device-native': 'waiting',
      'android-device-web': 'waiting',
      'android-device-native': 'waiting',
      'mac-chrome': null,
      'mac-safari': null,
      'mac-firefox': null,
      'ipad-simulator-web': null,
      'ipad-simulator-native': null,
      'android-emulator-web': null,
      'android-emulator-native': null,
    });
  });

  it('names every release role in the intro, not only the calibrated row', () => {
    expect(html).toContain(
      'The release gate is the 4 physical rows: iPad physical · web, iPad physical · native, Android physical · web, Android physical · native. Only iPad physical · web carries a calibrated drawing instrument'
    );
    expect(html).toContain(
      'the other 3 are gates-in-waiting until theirs are calibrated. Mac rows are a regression tripwire, and simulator and emulator rows are advisory (ADR-0156).'
    );
  });
});

describe('overview empty cells', () => {
  const matrix = published();
  const mode = matrix.targets.find((target) => target.id === 'ipad-device-web').modes[0];
  mode.drawing.pen.aggregate = {
    ...mode.drawing.pen.aggregate,
    runCount: 0,
    paint: { p95: null, p99: null, max: null },
  };
  mode.undo = null;
  const html = renderReport(matrix);

  it('renders a missing brush or undo cell as missing', () => {
    expect(html).toMatch(
      /<span class="mx-cell num missing" tabindex="0" title="iPad physical · web · [^"]* · Pen · not measured"/
    );
    expect(html).toMatch(
      /<span class="mx-cell missing" tabindex="0" title="iPad physical · web · [^"]* · undo not measured"/
    );
  });

  it('renders an unscoreable drawing aggregate and a failed-control actions cell as unavailable', () => {
    expect(html).toMatch(
      /<span class="mx-cell num unscoreable" tabindex="0"[^>]*title="Mac · Chrome · [^"]*unscoreable: preserved: no current verdict"/
    );
    expect(html).toMatch(
      /<span class="mx-cell num unscoreable" tabindex="0" title="Android emulator · web · [^"]*idle frame control is failed[^"]*"[^>]*>no control<\/span>/
    );
  });

  // Grey-only encoding is the defect this legend replaces: each meaning carries
  // a shape cue that survives without colour.
  it('gives each empty meaning a non-colour cue', () => {
    expect(html).toMatch(/\.heat-cell\.not-applicable:after\{[^}]*border-top:/);
    expect(html).toMatch(
      /\.heat-cell\.unscoreable,\.mx-cell\.unscoreable\{[^}]*repeating-linear-gradient/
    );
    expect(html).toMatch(/\.heat-cell\.missing,\.mx-cell\.missing\{[^}]*dashed/);
  });
});
