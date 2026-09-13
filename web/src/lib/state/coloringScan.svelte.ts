// What this boot knows about the installed-book scan, kept apart from
// coloringPacks.svelte.ts so the startup-path boot module can publish it
// without pulling the pack state and its selectors onto the startup path.
//
// `storage` is whether the device holds any coloring-pack storage to scan:
// unknown until the web boot's Cache Storage check lands, and present from the
// start on native, whose store is always scanned. `settled` is true once this
// boot's installed-book list changes only when a download finishes or the
// books are removed: a scan published it, or the run that would have scanned
// ended without one.
export type ColoringPackStorage = 'unknown' | 'absent' | 'present';

export const coloringScan = $state({
  storage: 'unknown' as ColoringPackStorage,
  settled: false,
});

export function setColoringPackStorage(storage: ColoringPackStorage) {
  coloringScan.storage = storage;
}

export function settleColoringScan() {
  coloringScan.settled = true;
}

// Whether an open of the coloring picker should still take the installed-book
// scan's answer: only when there is storage to scan and the scan has not landed.
export function installedBookScanPending(): boolean {
  return coloringScan.storage === 'present' && !coloringScan.settled;
}
