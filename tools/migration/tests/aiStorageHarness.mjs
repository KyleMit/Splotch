import { vi } from 'vitest';
import { rgbaPng } from '../../tests/native-png-fixtures.mjs';
import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';

const disk = vi.hoisted(() => ({
  raw: undefined,
  abort: false,
  failRevision: null,
  uncertain: false,
  uncertainRevision: null,
  tail: Promise.resolve(),
  opened: [],
}));
export { disk };
vi.mock('../../../web/src/lib/idbDatabase.ts', () => ({
  openDatabase: async (name, store) => {
    disk.opened.push([name, store]);
    return {
      closed: new Promise(() => {}),
      transaction: (_, mode) => {
        const turn = disk.tail;
        let release;
        disk.tail = new Promise((resolve) => {
          release = resolve;
        });
        let resolveDone, rejectDone, staged, timer;
        const done = new Promise((resolve, reject) => {
          resolveDone = resolve;
          rejectDone = reject;
        });
        function finish() {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (mode === 'readwrite' && (disk.abort || staged?.revision === disk.failRevision)) {
              // `abort` may hold the error the browser aborts with, such as a QuotaExceededError.
              const reason =
                disk.abort instanceof Error
                  ? disk.abort
                  : new Error('controlled transaction abort');
              disk.abort = false;
              rejectDone(reason);
            } else {
              if (staged !== undefined) disk.raw = structuredClone(staged);
              if (
                mode === 'readwrite' &&
                (disk.uncertain || staged?.revision === disk.uncertainRevision)
              ) {
                disk.uncertain = false;
                rejectDone(new Error('controlled unconfirmed commit'));
              } else resolveDone();
            }
            release();
          }, 0);
        }
        return {
          done,
          store: {
            get: async () => {
              await turn;
              const raw = structuredClone(disk.raw);
              finish();
              return raw;
            },
            put: async (value) => {
              staged = structuredClone(value);
              finish();
            },
          },
        };
      },
    };
  },
}));
vi.mock('../../../experiments/native-architecture/src/platform/aiImage.web.ts', async () => {
  const { originalImageGrid, resultImageGrid } =
    await import('../../../experiments/native-architecture/src/ai/imageAdmission.ts');
  return {
    admitAiImage: async (bytes, mime, purpose = 'result') => {
      await (purpose === 'original'
        ? originalImageGrid(bytes, () => true)
        : resultImageGrid(bytes, mime, () => true));
    },
  };
});

export const model = JSON.stringify(emptyDrawing(), null, 2);
export const png = new Uint8Array(rgbaPng(2, 2, 255));
export const journal = (id = 1, phase = 'sent') => ({
  version: 1,
  id,
  createdAt: 1000,
  style: 'Magical',
  originalId: `picture-${id}-fixture`,
  phase,
  jobId: null,
  result: null,
});
export function resetAiDisk() {
  disk.raw = undefined;
  disk.abort = false;
  disk.failRevision = null;
  disk.uncertain = false;
  disk.uncertainRevision = null;
  disk.tail = Promise.resolve();
  disk.opened = [];
}
