interface ProbeDiagnosticSnapshot {
  readonly mounts: number;
  readonly adoptions: number;
  readonly recoveries: number;
  readonly disposals: number;
  readonly activeRoots: number;
  readonly lastRecovery: string | null;
}

interface ProbeDiagnosticReader {
  snapshot(): ProbeDiagnosticSnapshot;
}

declare global {
  interface Window {
    __splotchWebHostDiagnostics?: ProbeDiagnosticReader;
  }
}

function createDiagnosticLedger() {
  let mounts = 0;
  let adoptions = 0;
  let recoveries = 0;
  let disposals = 0;
  let activeRoots = 0;
  let lastRecovery: string | null = null;
  const reader: ProbeDiagnosticReader = Object.freeze({
    snapshot: () =>
      Object.freeze({ mounts, adoptions, recoveries, disposals, activeRoots, lastRecovery }),
  });
  return {
    reader,
    mount() {
      mounts += 1;
      activeRoots += 1;
    },
    adopt() {
      adoptions += 1;
    },
    recover(error: unknown) {
      recoveries += 1;
      lastRecovery = error instanceof Error ? error.message : String(error);
    },
    dispose() {
      disposals += 1;
      activeRoots -= 1;
    },
  };
}

const ledger = createDiagnosticLedger();

export function createProbeDiagnostics() {
  window.__splotchWebHostDiagnostics = ledger.reader;
  ledger.mount();
  let disposed = false;
  let adopted = false;
  return {
    adopted() {
      if (disposed || adopted) return;
      adopted = true;
      ledger.adopt();
    },
    recovered(error: unknown) {
      if (!disposed) ledger.recover(error);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ledger.dispose();
    },
  };
}
