import type { SettingsReadFailure } from './settingsRead';
import type {
  ColorSettings,
  SoundSettings,
  SoundSettingsState,
  SoundSettingsStorage,
} from './soundSettingsCodec';

type WriterContext = {
  getState: () => SoundSettingsState;
  isDisposed: () => boolean;
  publish: (state: SoundSettingsState) => void;
};
type Serialize = (write: () => Promise<void>) => Promise<void>;

const SETTINGS_SAVE_FAILED_MESSAGE =
  'Your settings work for this session, but could not be saved. Please retry.';

// Shipping stores every choice synchronously, so its Settings never refuse or dim a choice for a
// save. Here a choice lands in the state at once and its write follows. Writes run one at a time
// and each carries the choices as they stand when it starts, so a choice made during another's
// write is kept, and the record never goes back to an older one. A choice made while one write
// waits joins that write.
export function createLatestWriter(
  storage: SoundSettingsStorage,
  serialize: (write: () => Promise<void>) => Promise<void>,
  {
    getState,
    isDisposed,
    publish,
    hasPendingParent,
    encode,
  }: WriterContext & {
    hasPendingParent: () => boolean;
    encode: (state: SoundSettingsState) => string;
  }
) {
  let revision = 0;
  let waiting: Promise<void> | null = null;
  // A Parent Center save in flight owns the status, and a failed one keeps its retry until its
  // own section retries it, so only the latest write of a ready record settles it.
  function settle(written: number, landed: boolean) {
    const state = getState();
    if (isDisposed() || written !== revision || state.status !== 'ready') return;
    if (!landed)
      publish({
        ...state,
        saved: false,
        message: state.saved ? SETTINGS_SAVE_FAILED_MESSAGE : state.message,
      });
    else if (!hasPendingParent() && (!state.saved || state.message))
      publish({ ...state, saved: true, message: '' });
  }
  return function writeLatest(): Promise<void> {
    revision += 1;
    if (waiting) return waiting;
    const job = { started: false };
    const write = serialize(async () => {
      job.started = true;
      waiting = null;
      const written = revision;
      const state = getState();
      if (isDisposed() || state.status === 'loading') return;
      try {
        await storage.write(encode(state));
        settle(written, true);
      } catch {
        settle(written, false);
      }
    });
    if (!job.started) waiting = write;
    return write;
  };
}

// Runs each write after the one before it has settled, and an idle queue's write at once.
export function createWriteQueue() {
  let tail: Promise<void> | null = null;
  return function serialize(write: () => Promise<void>): Promise<void> {
    const run = tail ? tail.then(write) : write();
    const settled = run.catch(() => undefined);
    tail = settled;
    void settled.then(() => {
      if (tail === settled) tail = null;
    });
    return run;
  };
}

export function createSettingsReset(
  storage: SoundSettingsStorage,
  serialize: Serialize,
  {
    getState,
    isDisposed,
    publish,
    defaults,
    getReadFailure,
    recovered,
    unreadState,
    paint,
    flushMetadata,
  }: WriterContext & {
    defaults: () => SoundSettings;
    getReadFailure: () => SettingsReadFailure | null;
    recovered: () => void;
    unreadState: () => SoundSettingsState;
    paint: () => ColorSettings;
    flushMetadata: () => Promise<void>;
  }
) {
  const canResetSavedSettings = () =>
    !isDisposed() && getState().status === 'ready' && getReadFailure() === 'malformed';
  return {
    canResetSavedSettings,
    async resetSavedSettings() {
      if (!canResetSavedSettings()) return;
      const replacement = defaults();
      const { version: _version, ...choices } = replacement;
      publish({ ...getState(), status: 'saving', message: '' });
      await serialize(async () => {
        try {
          await storage.write(JSON.stringify(replacement));
          recovered();
          publish({ status: 'ready', ...choices, ...paint(), saved: true, message: '' });
        } catch {
          publish(unreadState());
        }
      });
      await flushMetadata();
    },
  };
}
