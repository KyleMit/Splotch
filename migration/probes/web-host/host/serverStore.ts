import { PROBE_SERVER_SNAPSHOT, type ProbeStore } from '../src/probeProps.ts';

function serverAction(): never {
  throw new Error('SSR pending chrome cannot invoke a client action');
}

export const serverStore: ProbeStore = Object.freeze({
  subscribe: () => () => {},
  getSnapshot: () => PROBE_SERVER_SNAPSHOT,
  getServerSnapshot: () => PROBE_SERVER_SNAPSHOT,
  toggleTheme: serverAction,
  selectColor: serverAction,
  selectBrush: serverAction,
  openDialog: serverAction,
});
