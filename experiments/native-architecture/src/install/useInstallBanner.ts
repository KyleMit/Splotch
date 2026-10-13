import { useEffect, useState, useSyncExternalStore } from 'react';
import { SETTLED_IN_STROKES, type InstallPromptOwner, type InstallSnapshot } from './installPolicy';

// Continued drawing hands the install steps off to Settings with a short parting message.
export const PARTING_MESSAGE_MS = 4000;

export type InstallBanner = ReturnType<typeof useInstallBanner>;

const NO_INSTALL: InstallSnapshot = { mode: 'none', installed: false, stage: null };
const subscribeToNothing = () => () => {};

export function useInstallSnapshot(owner: InstallPromptOwner | null) {
  return useSyncExternalStore(
    owner?.subscribe ?? subscribeToNothing,
    owner?.snapshot ?? (() => NO_INSTALL)
  );
}

// The banner waits until the child has drawn a little, steps aside while other
// controls cover the screen, and auto-clears once ignored for a few more strokes.
export function useInstallBanner(
  owner: InstallPromptOwner | null,
  strokes: number,
  hidden: boolean
) {
  const snapshot = useInstallSnapshot(owner);
  const [hintOpen, setHintOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [parting, setParting] = useState(false);
  const eligible =
    owner !== null &&
    !snapshot.installed &&
    snapshot.stage !== null &&
    snapshot.mode !== 'none' &&
    strokes >= SETTLED_IN_STROKES;

  useEffect(() => {
    owner?.recordSession(strokes);
  }, [owner, strokes, snapshot.mode]);

  useEffect(() => {
    if (!owner) return;
    if (!eligible || hidden) {
      owner.disarmAutoClear();
      return;
    }
    if (parting) return;
    owner.armAutoClear(strokes);
    // A parent reading the steps or answering the browser's dialog outranks the countdown.
    if (hintOpen || busy) return;
    if (owner.autoDismissIfDue(strokes)) setParting(true);
  }, [owner, eligible, hidden, parting, strokes, hintOpen, busy]);

  useEffect(() => {
    if (!parting) return;
    const timer = setTimeout(() => setParting(false), PARTING_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [parting]);

  async function primary() {
    if (!owner) return;
    if (snapshot.mode !== 'oneTap') {
      setHintOpen((open) => !open);
      return;
    }
    setBusy(true);
    try {
      // A stale prompt drops to the manual steps, so open them rather than doing nothing.
      if ((await owner.prompt()) === 'unavailable') setHintOpen(true);
    } finally {
      setBusy(false);
    }
  }

  // Present spans the parting message; stepping aside under other controls only hides it, as
  // shipping's `hidden` attribute does, so neither side of that plays the enter or exit motion.
  return {
    present: eligible || parting,
    parting,
    mode: snapshot.mode,
    stage: snapshot.stage ?? 'initial',
    hintOpen,
    busy,
    primary,
    dismiss: () => owner?.dismiss(),
  };
}
