import { describe, expect, it } from 'vitest';
import { NOTCH_INSET_THRESHOLD_PX } from '$lib/platform/notchBand';
import { DEVICE_PROFILES } from './devices';
import { supportedOrientations, sizeClassOf } from './deviceProfile';
import { ORIENTATIONS, isLandscape } from './orientations';
import { bandVerdict, diagnose, unreclaimedInsetPx } from './diagnostics';

// The dataset is research, so the tests hold its shape and its internal
// consistency rather than re-asserting the researched numbers — restating a
// value here would only prove it was copied twice.

describe('device profiles', () => {
  it('has a unique id per profile', () => {
    const ids = DEVICE_PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers a distinct inset profile per entry', () => {
    const fingerprints = DEVICE_PROFILES.map((profile) =>
      JSON.stringify([profile.viewport, profile.insets])
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('offers at least portrait and both landscape rotations', () => {
    for (const profile of DEVICE_PROFILES) {
      expect(supportedOrientations(profile)).toEqual(
        expect.arrayContaining(['portrait', 'landscape-left', 'landscape-right'])
      );
    }
  });

  it('only lists orientations from the known set, with four finite insets each', () => {
    for (const profile of DEVICE_PROFILES) {
      for (const orientation of supportedOrientations(profile)) {
        expect(ORIENTATIONS).toContain(orientation);
        const insets = profile.insets[orientation];
        for (const value of Object.values(insets ?? {})) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  // The gap this test closes: every home-indicator iPad reports the same four
  // insets, so a dataset deduplicated by inset tuple alone drops the 13-inch —
  // the only viewport whose shorter side clears LARGE_TABLET_MIN_SIDE_PX and
  // therefore the only one that renders the largeTablet action-button step.
  // Coverage is of layout classes, not just inset tuples.
  it('exercises every action-button size class', () => {
    const covered = new Set(DEVICE_PROFILES.map(sizeClassOf));
    expect([...covered].sort()).toEqual(['largeTablet', 'phone', 'tablet']);
  });

  it('cites a source for every profile', () => {
    for (const profile of DEVICE_PROFILES) {
      expect(profile.sources.length).toBeGreaterThan(0);
      expect(profile.notes.length).toBeGreaterThan(0);
    }
  });

  // The two rotations are the same physical device held two ways, so a profile
  // whose landscape entries disagree in size would be describing two devices.
  it('gives both landscape rotations mirror-image insets', () => {
    for (const profile of DEVICE_PROFILES) {
      const left = profile.insets['landscape-left'];
      const right = profile.insets['landscape-right'];
      expect(left && right).toBeTruthy();
      expect({ ...left, left: right?.right, right: right?.left }).toEqual(left);
      expect(left?.top).toBe(right?.top);
      expect(left?.bottom).toBe(right?.bottom);
    }
  });

  it('never claims a cutout deep enough to band on a device with no cutout', () => {
    for (const profile of DEVICE_PROFILES.filter((p) => p.cutout.kind === 'none')) {
      for (const orientation of supportedOrientations(profile)) {
        const insets = profile.insets[orientation];
        expect(insets && Math.max(insets.top, insets.left, insets.right)).toBeLessThan(
          NOTCH_INSET_THRESHOLD_PX
        );
      }
    }
  });
});

describe('diagnose', () => {
  it('reports the band edge the app would actually paint', () => {
    const portrait = diagnose(byId('iphone-island-59'), 'portrait');
    expect(portrait).toMatchObject({
      bandEdges: ['top'],
      cutoutScreenEdge: 'top',
      missesCutout: false,
    });
  });

  // This harness was built to make a defect visible, and this is the test that
  // used to record it: iOS reports both landscape sides identically, so the old
  // "deeper inset wins" rule resolved right on both rotations and was wrong on
  // one of them. Both sides are painted now — neither strip is claimable, so
  // covering both costs nothing and cannot land on the wrong one.
  it('covers the cutout in both iPhone landscape rotations', () => {
    for (const orientation of ['landscape-left', 'landscape-right'] as const) {
      expect(diagnose(byId('iphone-island-59'), orientation)).toMatchObject({
        bandEdges: ['left', 'right'],
        missesCutout: false,
      });
    }
  });

  // The same defect reached a different way, and the reason the fix cannot just
  // be "paint both": 3-button navigation puts a DEEPER inset on the side
  // opposite the camera, so painting both would paint over the nav buttons and
  // picking the deeper one picks the nav bar. Here the rotation angle decides.
  it('follows the rotation angle past the Android 3-button nav bar', () => {
    expect(diagnose(byId('android-native-punch-3button'), 'landscape-left')).toMatchObject({
      bandEdges: ['left'],
      cutoutScreenEdge: 'left',
      missesCutout: false,
    });
    expect(diagnose(byId('android-native-punch-3button'), 'landscape-right')).toMatchObject({
      bandEdges: ['right'],
      cutoutScreenEdge: 'right',
      missesCutout: false,
    });
  });

  it('paints nothing on a device whose insets are all below the notch threshold', () => {
    for (const orientation of supportedOrientations(byId('ipad-home-indicator'))) {
      expect(diagnose(byId('ipad-home-indicator'), orientation)?.bandEdges).toEqual([]);
    }
  });

  // The whole point of the fix: no scenario in the matrix paints a band on an
  // edge the cutout is not on. A regression here is the original defect coming
  // back, on whichever device reintroduces it.
  it('never paints a band away from the cutout, on any device or rotation', () => {
    const misses = DEVICE_PROFILES.flatMap((profile) =>
      supportedOrientations(profile)
        .filter((orientation) => diagnose(profile, orientation)?.missesCutout)
        .map((orientation) => `${profile.id} · ${orientation}`)
    );
    expect(misses).toEqual([]);
  });

  it('counts every inset the band does not reclaim', () => {
    // Nothing is painted here, so the whole 20px bottom inset is given up.
    expect(unreclaimedInsetPx(byId('ipad-safari-tab'), 'portrait')).toBe(20);
    // The band takes the 59px top; the 34px home indicator is what is left.
    expect(unreclaimedInsetPx(byId('iphone-island-59'), 'portrait')).toBe(34);
  });

  it('resolves an orientation the device does not offer to null', () => {
    expect(diagnose(byId('iphone-island-59'), 'portrait-upside-down')).toBeNull();
  });
});

describe('band verdicts', () => {
  // The ratchet the Samsung profile earned. hasNotch(28.6) is false against the
  // 30px threshold, so a real hole punch gets no band — and a spec that merely
  // skips transparent bands passes without ever saying so. Every disagreement
  // between the hardware and the app must now name a cause; an unexplained one
  // is a new defect and fails here rather than passing quietly.
  it('explains every disagreement between the cutout and the painted band', () => {
    const unexplained = DEVICE_PROFILES.flatMap((profile) =>
      supportedOrientations(profile).flatMap((orientation) => {
        const verdict = bandVerdict(profile, orientation);
        if (!verdict || verdict.cause) return [];
        const covered =
          verdict.expected === null
            ? verdict.painted.length === 0
            : verdict.painted.includes(verdict.expected as never);
        if (covered) return [];
        return [
          `${profile.id} · ${orientation}: expected ${verdict.expected}, painted ${verdict.painted.join('+') || 'nothing'}`,
        ];
      })
    );
    expect(unexplained).toEqual([]);
  });

  it('records the Samsung hole punch as a real cutout the threshold declines', () => {
    expect(bandVerdict(byId('android-samsung-punch'), 'portrait')).toMatchObject({
      expected: 'top',
      painted: [],
      cause: 'cutout-below-threshold',
    });
  });

  it('records Android web as unable to paint a band at all', () => {
    expect(bandVerdict(byId('android-chrome-tab'), 'portrait')).toMatchObject({
      expected: 'top',
      painted: [],
      cause: 'platform-paints-no-band',
    });
  });

  it('leaves a correctly painted band with no cause', () => {
    expect(bandVerdict(byId('iphone-island-59'), 'portrait')).toMatchObject({
      expected: 'top',
      painted: ['top'],
      cause: null,
    });
  });
});

describe('orientation vocabulary', () => {
  it('classes exactly the two landscape entries as landscape', () => {
    expect(ORIENTATIONS.filter(isLandscape)).toEqual(['landscape-left', 'landscape-right']);
  });
});

function byId(id: string) {
  const profile = DEVICE_PROFILES.find((entry) => entry.id === id);
  if (!profile) throw new Error(`no device profile ${id}`);
  return profile;
}
