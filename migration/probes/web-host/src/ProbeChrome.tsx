import { useEffect, useId, useSyncExternalStore } from 'react';
import { paletteHex, type PaletteLabel } from '../../../../web/src/lib/palette';
import { PROBE_DIALOG_ID, PROBE_DIALOG_OPENER_ID, type ProbeChromeProps } from './probeProps';

const PROBE_PALETTE: readonly PaletteLabel[] = ['Purple', 'Blue', 'Black'];

export function ProbeChrome({ store, initialPendingLabel, onAdopted }: ProbeChromeProps) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
  const statusId = useId();
  useEffect(onAdopted, [onAdopted]);

  return (
    <div className="splotch-probe-chrome" aria-label="Web host probe">
      <span className="splotch-probe-swatch" aria-hidden="true" />
      <p className="splotch-probe-status" id={statusId} role="status">
        {snapshot.phase === 'pending'
          ? initialPendingLabel
          : `${snapshot.theme === 'dark' ? 'Night' : 'Light'} paper · ${snapshot.canvasEmpty ? 'Empty' : 'Ink'} · ${snapshot.strokeCount} committed strokes · ${snapshot.undoCount} undos · ${snapshot.canUndo ? 'Undo ready' : 'No undo'} · ${snapshot.brush} · ${snapshot.activeColor}`}
      </p>
      <div className="splotch-probe-actions" aria-label="Probe palette">
        {PROBE_PALETTE.map((label) => (
          <button
            className="splotch-probe-button"
            type="button"
            key={label}
            disabled={snapshot.phase === 'pending'}
            aria-pressed={snapshot.phase === 'live' && snapshot.activeSwatch === paletteHex(label)}
            onClick={() => store.selectColor(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="splotch-probe-actions" aria-label="Probe brush">
        {(snapshot.phase === 'live' ? snapshot.brushOptions : []).map(({ brush, label }) => (
          <button
            className="splotch-probe-button"
            type="button"
            key={brush}
            disabled={snapshot.phase === 'pending'}
            aria-pressed={snapshot.phase === 'live' && snapshot.brush === brush}
            onClick={() => store.selectBrush(brush)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="splotch-probe-actions">
        <button
          className="splotch-probe-button"
          type="button"
          disabled={snapshot.phase === 'pending'}
          onClick={store.toggleTheme}
          aria-describedby={statusId}
        >
          Change theme
        </button>
        <button
          className="splotch-probe-button"
          type="button"
          id={PROBE_DIALOG_OPENER_ID}
          aria-haspopup="dialog"
          aria-controls={PROBE_DIALOG_ID}
          disabled={snapshot.phase === 'pending'}
          onClick={(event) => store.openDialog(event.currentTarget)}
        >
          Open dialog
        </button>
      </div>
    </div>
  );
}
