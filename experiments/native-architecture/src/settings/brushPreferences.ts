import { BRUSH_ORDER, DEFAULT_BRUSH, type Brush } from '../drawing/brushes';

export type OptionalBrush = Exclude<Brush, 'pen'>;
type InkBrush = Extract<Brush, 'pen' | 'crayon'>;
type PersistedBrush = Exclude<Brush, 'eraser'>;
export const OPTIONAL_BRUSHES = ['crayon', 'magic', 'eraser'] as const;
export type BrushAvailability = Readonly<Record<OptionalBrush, boolean>>;
export const DEFAULT_BRUSH_AVAILABILITY: BrushAvailability = {
  crayon: true,
  magic: true,
  eraser: true,
};
export type BrushPreferencesStorage = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
};
export type BrushPreferencesState = Readonly<{
  status: 'loading' | 'ready';
  brush: Brush;
  availability: BrushAvailability;
  saved: boolean;
  message: string;
}>;
export const MAX_BRUSH_SETTINGS_BYTES = 1024;
function isBrush(value: unknown): value is Brush {
  return BRUSH_ORDER.some((brush) => brush === value);
}
function isOptional(value: unknown): value is OptionalBrush {
  return OPTIONAL_BRUSHES.some((brush) => brush === value);
}
export function availableBrushes(availability: BrushAvailability): readonly Brush[] {
  return BRUSH_ORDER.filter((brush) => brush === 'pen' || availability[brush]);
}
export function brushControl(availability: BrushAvailability) {
  const optional = OPTIONAL_BRUSHES.filter((brush) => availability[brush]);
  if (optional.length === 0) return { kind: 'none' } as const;
  if (optional.length === 1) return { kind: 'toggle', brush: optional[0] } as const;
  return { kind: 'menu', brushes: availableBrushes(availability) } as const;
}
export function parseBrushPreferences(snapshot: string) {
  if (snapshot.length > MAX_BRUSH_SETTINGS_BYTES) throw new Error('Brush settings are too large.');
  const value: unknown = JSON.parse(snapshot);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('brush' in value) ||
    !isBrush(value.brush) ||
    value.brush === 'eraser' ||
    !('availability' in value) ||
    !value.availability ||
    typeof value.availability !== 'object' ||
    !('crayon' in value.availability) ||
    typeof value.availability.crayon !== 'boolean' ||
    !('magic' in value.availability) ||
    typeof value.availability.magic !== 'boolean' ||
    !('eraser' in value.availability) ||
    typeof value.availability.eraser !== 'boolean'
  )
    throw new Error('Brush settings are invalid.');
  const result = {
    version: 1,
    brush: value.brush,
    availability: {
      crayon: value.availability.crayon,
      magic: value.availability.magic,
      eraser: value.availability.eraser,
    },
  } as const;
  if (JSON.stringify(result) !== snapshot)
    throw new Error('Brush settings are not in the saved format.');
  return result;
}
function loadedBrushPreferences(
  brush: PersistedBrush,
  availability: BrushAvailability
): BrushPreferencesState {
  return { status: 'ready', brush, availability, saved: true, message: '' };
}
function failedBrushPreferences(): BrushPreferencesState {
  return {
    status: 'ready',
    brush: 'pen',
    availability: { crayon: false, magic: false, eraser: false },
    saved: false,
    message: 'Brush choices could not be read. Pen is ready; choose tools in Settings.',
  };
}
export function createBrushPreferences(
  storage: BrushPreferencesStorage,
  changed: (state: BrushPreferencesState) => void
) {
  let state: BrushPreferencesState = {
    status: 'loading',
    brush: DEFAULT_BRUSH,
    availability: DEFAULT_BRUSH_AVAILABILITY,
    saved: true,
    message: '',
  };
  let lastInk: InkBrush = 'pen';
  let storedBrush: PersistedBrush = 'pen';
  let disposed = false;
  let revision = 0;
  let pending: { snapshot: string; revision: number } | null = null;
  let writing: Promise<void> | null = null;
  function publish(next: BrushPreferencesState) {
    if (!disposed) {
      state = next;
      changed(state);
    }
  }
  function persist() {
    const snapshot = JSON.stringify({
      version: 1,
      brush: storedBrush,
      availability: state.availability,
    });
    const current = ++revision;
    publish({ ...state, saved: false, message: '' });
    pending = { snapshot, revision: current };
    if (!writing) {
      writing = Promise.resolve().then(async () => {
        try {
          while (pending && !disposed) {
            const job = pending;
            pending = null;
            try {
              await storage.write(job.snapshot);
              if (!disposed && revision === job.revision)
                publish({ ...state, saved: true, message: '' });
            } catch {
              if (!disposed && revision === job.revision)
                publish({
                  ...state,
                  saved: false,
                  message:
                    'Brush choices work for this session but could not be saved. Retry in Settings.',
                });
            }
          }
        } finally {
          writing = null;
        }
      });
    }
    return writing;
  }

  function selectBrush(brush: Brush) {
    if (disposed || state.status !== 'ready') return;
    if (!isBrush(brush)) throw new Error('Brush choice is invalid.');
    if (brush !== 'pen' && !state.availability[brush]) return;
    if (brush === 'pen' || brush === 'crayon') lastInk = brush;
    publish({ ...state, brush });
    if (brush !== 'eraser') {
      storedBrush = brush;
      void persist();
    }
  }
  return {
    getState: () => state,
    async load() {
      if (disposed || state.status !== 'loading') return;
      try {
        const raw = await storage.read();
        if (disposed) return;
        const saved =
          raw === null
            ? { brush: 'pen' as const, availability: DEFAULT_BRUSH_AVAILABILITY }
            : parseBrushPreferences(raw);
        const brush =
          saved.brush === 'pen' || saved.availability[saved.brush] ? saved.brush : 'pen';
        storedBrush = brush;
        lastInk = brush === 'crayon' ? 'crayon' : 'pen';
        publish(loadedBrushPreferences(brush, saved.availability));
      } catch {
        publish(failedBrushPreferences());
      }
    },
    selectBrush,
    selectInkBrush() {
      if (state.brush === 'eraser' || state.brush === 'magic') selectBrush(lastInk);
    },
    resetAfterClear() {
      if (state.brush === 'eraser') selectBrush(lastInk);
    },
    toggleOptional() {
      const control = brushControl(state.availability);
      if (control.kind === 'toggle')
        selectBrush(state.brush === control.brush ? 'pen' : control.brush);
    },
    setAvailable(brush: OptionalBrush, enabled: boolean) {
      if (disposed || state.status !== 'ready') return;
      if (!isOptional(brush) || typeof enabled !== 'boolean')
        throw new Error('Brush availability is invalid.');
      if (brush === 'crayon' && !enabled) lastInk = 'pen';
      const active = state.brush === brush && !enabled ? lastInk : state.brush;
      if (storedBrush === brush && !enabled) storedBrush = lastInk;
      if (active !== 'eraser') storedBrush = active;
      publish({
        ...state,
        brush: active,
        availability: { ...state.availability, [brush]: enabled },
      });
      void persist();
    },
    retrySave: persist,
    dispose() {
      disposed = true;
      revision++;
    },
  };
}
