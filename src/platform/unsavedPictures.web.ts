import type { DBSchema, IdbDatabase } from '../lib/idbDatabase';
import type { UnsavedPictureStore } from '../export/saveFailure';
import { readUnsavedPictures } from '../export/unsavedPictures';

const DATABASE = 'splotch-candidate-unsaved-pictures';
const STORE = 'held';
const KEY = 'pictures';
interface UnsavedDatabase extends DBSchema {
  held: { key: typeof KEY; value: unknown };
}

function createStore(): UnsavedPictureStore {
  let connection: Promise<IdbDatabase<UnsavedDatabase>> | undefined;
  function database() {
    if (!connection) {
      const opening = import('../lib/idbDatabase').then(({ openDatabase }) =>
        openDatabase<UnsavedDatabase>(DATABASE, STORE)
      );
      connection = opening;
      void opening.then(
        (db) =>
          db.closed.then(() => {
            if (connection === opening) connection = undefined;
          }),
        () => {
          if (connection === opening) connection = undefined;
        }
      );
    }
    return connection;
  }
  return {
    async read() {
      return readUnsavedPictures(await (await database()).get(STORE, KEY));
    },
    async write(pictures) {
      await (await database()).put(STORE, pictures, KEY);
    },
  };
}

export const unsavedPictureStore = createStore();
