import type { PaletteLabel } from '$lib/palette';
import type { BrushType, BrushOption } from '$lib/state/tool.svelte';

export type ProbeFixture = 'matching' | 'text-mismatch';
type ProbeTheme = 'light' | 'dark';

export const PROBE_IDENTIFIER_PREFIX = 'splotch-web-host-';
export const PROBE_DIALOG_ID = 'splotchWebHostDialog';
export const PROBE_DIALOG_HEADING_ID = 'splotchWebHostDialogHeading';
export const PROBE_DIALOG_OPENER_ID = 'splotchWebHostDialogOpener';
export const PROBE_DIALOG_CLOSE_ID = 'splotchWebHostDialogClose';
export const PROBE_DIALOG_REFUSAL_ID = 'splotchWebHostDialogRefusal';
export const PROBE_DIALOG_SETTINGS_ID = 'splotchWebHostDialogSettings';
export const PROBE_MOUNT_STATE_ATTRIBUTE = 'data-probe-state';
export const PROBE_MOUNT_STATES = {
  hydrating: 'hydrating',
  adopted: 'adopted',
  disposed: 'disposed',
  failed: 'failed',
} as const;
export const PROBE_PENDING_LABEL = 'Drawing state pending';
export const PROBE_MISMATCH_LABEL = 'Client recovery pending';

type ProbePendingLabel = typeof PROBE_PENDING_LABEL | typeof PROBE_MISMATCH_LABEL;

export type ProbeSnapshot =
  | Readonly<{ phase: 'pending' }>
  | Readonly<{
      phase: 'live';
      theme: ProbeTheme;
      canUndo: boolean;
      undoCount: number;
      canvasEmpty: boolean;
      strokeCount: number;
      activeSwatch: string;
      activeColor: string;
      brush: BrushType;
      brushOptions: readonly BrushOption[];
    }>;

export const PROBE_SERVER_SNAPSHOT: ProbeSnapshot = Object.freeze({ phase: 'pending' });

export interface ProbeStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ProbeSnapshot;
  getServerSnapshot(): ProbeSnapshot;
  toggleTheme(): void;
  selectColor(label: PaletteLabel): void;
  selectBrush(brush: BrushType): void;
  openDialog(trigger: HTMLButtonElement): void;
}

export interface ProbeChromeProps {
  store: ProbeStore;
  initialPendingLabel: ProbePendingLabel;
  onAdopted: () => void;
}

export function isProbeFixture(value: unknown): value is ProbeFixture {
  return value === 'matching' || value === 'text-mismatch';
}
