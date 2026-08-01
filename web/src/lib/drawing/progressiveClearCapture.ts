interface PendingClearCapture<Command> {
  command: Command;
  remaining: boolean[];
  remainingCount: number;
  nextIndex: number;
  revision: number;
}

interface ProgressiveClearCaptureHooks<Command> {
  tileCount: () => number;
  capture: (command: Command, index: number) => boolean;
  onComplete: () => void;
}

export function createProgressiveClearCapture<Command>(
  hooks: ProgressiveClearCaptureHooks<Command>
) {
  let revision = 0;
  let pending: PendingClearCapture<Command> | null = null;

  function cancel() {
    revision++;
    pending = null;
  }

  function captureIndex(index: number) {
    const current = pending;
    if (!current?.remaining[index] || !hooks.capture(current.command, index)) return false;
    current.remaining[index] = false;
    current.remainingCount--;
    if (current.remainingCount === 0) {
      pending = null;
      hooks.onComplete();
    }
    return true;
  }

  function resolve() {
    const current = pending;
    if (!current) return;
    for (let index = 0; index < current.remaining.length; index++) captureIndex(index);
  }

  function schedule(command: Command, indices: number[]) {
    if (indices.length === 0) return;
    resolve();
    const scheduledRevision = ++revision;
    const remaining = Array.from({ length: hooks.tileCount() }, (_, index) =>
      indices.includes(index)
    );
    pending = {
      command,
      remaining,
      remainingCount: indices.length,
      nextIndex: 0,
      revision: scheduledRevision,
    };
    const captureNext = () => {
      const current = pending;
      if (!current || current.revision !== scheduledRevision) return;
      while (
        current.nextIndex < current.remaining.length &&
        !current.remaining[current.nextIndex]
      ) {
        current.nextIndex++;
      }
      if (current.nextIndex < current.remaining.length) captureIndex(current.nextIndex++);
      if (pending?.revision === scheduledRevision && pending.nextIndex < pending.remaining.length) {
        requestAnimationFrame(captureNext);
      }
    };
    requestAnimationFrame(captureNext);
  }

  function takePendingIndices(command: Command) {
    const current = pending;
    if (current?.command !== command) return [];
    const indices: number[] = [];
    for (let index = 0; index < current.remaining.length; index++) {
      if (current.remaining[index]) indices.push(index);
    }
    cancel();
    return indices;
  }

  return {
    cancel,
    captureBeforeMutation: captureIndex,
    resolve,
    schedule,
    takePendingIndices,
  };
}
