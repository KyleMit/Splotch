let wakeModule: Promise<typeof import('expo-keep-awake')> | null = null;

function loadWakeModule() {
  wakeModule ??= import('expo-keep-awake').catch((error: unknown) => {
    wakeModule = null;
    throw error;
  });
  return wakeModule;
}

export function installAppSurface(): () => void {
  let disposed = false;
  let release = () => {};
  void loadWakeModule()
    .then(({ activateKeepAwakeAsync, deactivateKeepAwake }) => {
      if (disposed) return;
      const tag = `SplotchDrawing-${Math.random()}`;
      release = () => void deactivateKeepAwake(tag).catch(() => {});
      void activateKeepAwakeAsync(tag).catch(() => {});
    })
    .catch(() => {});
  return () => {
    disposed = true;
    release();
  };
}
