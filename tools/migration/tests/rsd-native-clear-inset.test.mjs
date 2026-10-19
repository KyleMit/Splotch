import { host, records } from './rsd-native-selection-host.mjs';
import { expect, it } from 'vitest';
import { clearProps, mountClear, press } from './rsd-native-clear-fixture.mjs';

const byTestID = (testID) => flat(records.props.findLast((props) => props.testID === testID).style);

function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

// Shipping docks its fixed .clear-container at right: calc(-10px + var(--safe-area-right)), over
// the Notch Band, so in landscape the tab's square end sits 10px into the side inset; its accept
// zone sits under the band. Negative controls: clipping the overlay to the safe-area frame hides
// that overhang, and an unclipped ring paints over the band.
it('overhangs the docked tab into a landscape side inset while the ring keeps to the frame', async () => {
  const side = 47;
  records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
  records.insets = { top: 0, right: side, bottom: 21, left: side };
  await mountClear();
  const clip = host.querySelector('[data-testid="rsd-clear-clip"]');
  const overlay = host.querySelector('[data-testid="rsd-clear-overlay"]');
  expect(overlay.parentElement).toBe(clip);
  expect(byTestID('rsd-clear-clip')).toEqual({
    position: 'absolute',
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    left: -side,
    right: -side,
  });
  expect(byTestID('rsd-clear-overlay')).toEqual({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: side,
    right: side,
  });
  // The tab's square end, measured from the screen's right edge, as shipping places it.
  expect(side + byTestID('rsd-clear-dock').right).toBe(side - 10);
  expect(clearProps().style).toMatchObject({ width: 70 });
  await press();
  const ring = host.querySelector('[data-testid="rsd-clear-accept-ring"]');
  expect(ring.parentElement.dataset.testid).toBe('rsd-clear-ring-clip');
  expect(ring.parentElement.parentElement).toBe(overlay);
  expect(byTestID('rsd-clear-ring-clip')).toEqual({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  });
  expect(
    overlay.querySelector('[data-testid="rsd-clear-ring-clip"] [aria-label="Clear drawing"]')
  ).toBeNull();
});
