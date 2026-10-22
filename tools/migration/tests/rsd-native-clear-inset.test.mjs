import { host, records } from './rsd-native-selection-host.mjs';
import { expect, it } from 'vitest';
import { clearProps, mountClear, press } from './rsd-native-clear-fixture.mjs';
import { paletteHex } from '../../../src/drawing/palette.ts';

const byTestID = (testID) => flat(records.props.findLast((props) => props.testID === testID).style);
const committed = (node) => JSON.parse(node.dataset.committedProps).style;

function flat(style) {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style;
}

// Shipping docks its fixed .clear-container at right: calc(-10px + var(--safe-area-right)), over
// the Notch Band, so in landscape the tab's square end sits 10px into the right inset; the band
// covers the Actions Panel and the Flat rail glass, and the accept zone sits under it. Negative
// controls: clipping the overlay to the safe-area frame hides that overhang, mounting the right
// strip after the overlay covers it again, mounting it before the paper column bares what that
// column paints into the inset, starting it at the safe-area top leaves the inset's corner bare
// under a top inset, and an unclipped ring paints over the band.
it.each([
  ['an iPhone in landscape', 0],
  ['a landscape window with a top inset as well', 24],
])(
  'overhangs the docked tab into the right inset of %s while the ring keeps to the frame',
  async (_name, top) => {
    const side = 47;
    records.dimensions = { width: 844, height: 390, scale: 1, fontScale: 1 };
    records.insets = { top, right: side, bottom: 21, left: side };
    records.journalHostProps = true;
    await mountClear();
    const layout = host.querySelector('[data-testid="rsd-drawing-layout"]');
    const order = (testID) =>
      [...layout.children].indexOf(host.querySelector(`[data-testid="${testID}"]`));
    expect(order('rsd-canvas-column')).toBeGreaterThanOrEqual(0);
    expect(order('rsd-dock-band')).toBeGreaterThan(order('rsd-canvas-column'));
    expect(order('rsd-clear-clip')).toBeGreaterThan(order('rsd-dock-band'));
    // The right strip runs the whole window's height, the top inset's corner included.
    const dock = host.querySelector('[data-testid="rsd-dock-band"]');
    expect(committed(dock)).toEqual({
      position: 'absolute',
      bottom: 0,
      top: 0 - top,
      left: -side,
      right: -side,
    });
    expect(JSON.parse(dock.dataset.committedProps).pointerEvents).toBe('none');
    expect([...dock.children].map(committed)).toEqual([
      expect.objectContaining({
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: side,
        backgroundColor: paletteHex('Purple'),
      }),
    ]);
    expect(byTestID('rsd-clear-clip')).toEqual({
      position: 'absolute',
      top: 0,
      bottom: 0,
      overflow: 'hidden',
      left: -side,
      right: -side,
    });
    const overlay = host.querySelector('[data-testid="rsd-clear-overlay"]');
    expect(overlay.parentElement.dataset.testid).toBe('rsd-clear-clip');
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
  }
);
