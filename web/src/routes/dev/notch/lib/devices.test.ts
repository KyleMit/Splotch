import { describe, expect, it } from 'vitest';
import { NOTCH_INSET_THRESHOLD_PX } from '$lib/platform/notchBand';
import { DEVICE_PROFILES } from './devices';
import { supportedOrientations } from './deviceProfile';
import { ORIENTATIONS, isLandscape } from './orientations';
import { diagnose, unreclaimedInsetPx } from './diagnostics';

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
    expect(portrait).toMatchObject({ bandEdge: 'top', cutoutScreenEdge: 'top', wrongSide: false });
  });

  // The finding this harness exists to make visible: iOS reports both landscape
  // sides identically, so the app's "deeper inset wins" rule resolves to the
  // right edge on both rotations and lands on the wrong one half the time.
  it('catches the iPhone landscape band painting away from the cutout', () => {
    const left = diagnose(byId('iphone-island-59'), 'landscape-left');
    const right = diagnose(byId('iphone-island-59'), 'landscape-right');
    expect(left).toMatchObject({ bandEdge: 'right', cutoutScreenEdge: 'left', wrongSide: true });
    expect(right).toMatchObject({ bandEdge: 'right', cutoutScreenEdge: 'right', wrongSide: false });
  });

  // Same failure, reached a different way: 3-button navigation puts a deeper
  // inset on the side opposite the camera, so the deeper-wins rule picks the
  // nav bar in BOTH rotations.
  it('catches the Android 3-button nav bar outbidding the cutout', () => {
    for (const orientation of ['landscape-left', 'landscape-right'] as const) {
      const diagnosis = diagnose(byId('android-native-punch-3button'), orientation);
      expect(diagnosis?.wrongSide).toBe(true);
    }
  });

  it('paints nothing on a device whose insets are all below the notch threshold', () => {
    for (const orientation of supportedOrientations(byId('ipad-home-indicator'))) {
      expect(diagnose(byId('ipad-home-indicator'), orientation)?.bandEdge).toBeNull();
    }
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
