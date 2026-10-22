import { expect, it, vi } from 'vitest';
import { createAiAutoSave } from '../../src/ai/aiAutoSave.ts';
import { createAutoSaveRunner } from '../../src/product/useAiAutoSave.ts';

vi.mock('react-native', () => ({}));
vi.mock('../../src/keepPicture.ts', () => ({
  savePicture: async () => 'photos',
}));

const DRAWING = 'drawing-bytes';
const SUBMITTED = `data:image/png;base64,${DRAWING}`;
const FORMAT = { baseName: 'splotch-ai', mime: 'image/png' };
const picture = (n) => ({ uri: `file:///owned/ai-${n}.png`, mime: 'image/png' });

// Each picture keep and drawing save waits until the test resolves it.
function fixture() {
  const keeps = [];
  const saves = [];
  const report = vi.fn();
  const card = { owner: null };
  const save = createAiAutoSave({
    keep: (kept) => {
      const held = Promise.withResolvers();
      keeps.push({ picture: kept, resolve: held.resolve });
      return held.promise;
    },
    save: (base64) => {
      const held = Promise.withResolvers();
      saves.push({ base64, resolve: held.resolve });
      return held.promise;
    },
    report,
    publish: () => {},
    owns: (id) => card.owner === id,
  });
  const autoSave = {
    follow: (id) => {
      card.owner = id;
    },
    save,
  };
  const kept = (index, outcome = 'photos') =>
    keeps[index].resolve({ outcome, base64: `bytes-${index}`, format: FORMAT });
  return { autoSave, keeps, saves, report, kept };
}
const settle = () => new Promise((done) => setTimeout(done, 0));

it('saves nothing more for a run whose card was closed and replaced while its picture saved', async () => {
  const f = fixture();
  f.autoSave.follow(1);
  const first = f.autoSave.save(1, picture(1), SUBMITTED);
  f.autoSave.follow(null);
  f.autoSave.follow(2);
  const second = f.autoSave.save(2, picture(2), SUBMITTED);
  f.kept(1);
  await settle();
  expect(f.saves.map(({ base64 }) => base64)).toEqual([DRAWING]);
  f.kept(0);
  await first;
  expect(f.saves).toHaveLength(1);
  f.saves[0].resolve('photos');
  await second;
  expect(f.report).not.toHaveBeenCalled();
});

it('saves no drawing for a run whose card was closed while its picture saved', async () => {
  const f = fixture();
  f.autoSave.follow(1);
  const first = f.autoSave.save(1, picture(1), SUBMITTED);
  f.autoSave.follow(null);
  f.kept(0);
  await first;
  expect(f.saves).toHaveLength(0);
});

it('does not save a drawing again while another run is still saving it', async () => {
  const f = fixture();
  f.autoSave.follow(1);
  const first = f.autoSave.save(1, picture(1), SUBMITTED);
  f.kept(0);
  await settle();
  expect(f.saves).toHaveLength(1);
  f.autoSave.follow(2);
  const second = f.autoSave.save(2, picture(2), SUBMITTED);
  f.kept(1);
  await second;
  expect(f.saves).toHaveLength(1);
  f.saves[0].resolve('photos');
  await first;
});

it('tries a drawing again on the next run when its save did not land', async () => {
  const f = fixture();
  f.autoSave.follow(1);
  const first = f.autoSave.save(1, picture(1), SUBMITTED);
  f.kept(0);
  await settle();
  f.saves[0].resolve('denied');
  await first;
  expect(f.report).toHaveBeenCalledWith('denied', DRAWING);
  f.autoSave.follow(2);
  const second = f.autoSave.save(2, picture(2), SUBMITTED);
  f.kept(1);
  await settle();
  expect(f.saves).toHaveLength(2);
  f.saves[1].resolve('photos');
  await second;
});

it('reports a run whose saver failed to load, and loads it again for the next run', async () => {
  const save = vi.fn(async () => {});
  const load = vi.fn().mockRejectedValueOnce(new Error('chunk offline')).mockResolvedValue(save);
  const failed = vi.fn();
  const run = createAutoSaveRunner(load, failed);
  run(1, picture(1), SUBMITTED);
  await settle();
  expect(failed).toHaveBeenCalledWith(1, picture(1));
  expect(save).not.toHaveBeenCalled();
  run(1, picture(1), SUBMITTED);
  run(2, picture(2), SUBMITTED);
  await settle();
  expect(load).toHaveBeenCalledTimes(2);
  expect(failed).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledExactlyOnceWith(2, picture(2), SUBMITTED);
});
