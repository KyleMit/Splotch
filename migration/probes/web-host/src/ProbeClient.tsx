import { hydrateRoot, type Root } from 'react-dom/client';
import { ProbeChrome } from './ProbeChrome';
import { createProbeBridge } from './probeBridge.svelte';
import { bindProbeModal } from './probeModal.svelte';
import { createProbeDiagnostics } from './probeDiagnostics';
import {
  isProbeFixture,
  PROBE_IDENTIFIER_PREFIX,
  PROBE_MISMATCH_LABEL,
  PROBE_PENDING_LABEL,
  PROBE_MOUNT_STATE_ATTRIBUTE,
  PROBE_MOUNT_STATES,
  type ProbeFixture,
} from './probeProps';

const mountedContainers = new WeakSet<HTMLElement>();

export function mountProbeClient(
  outer: HTMLElement,
  inner: HTMLElement,
  dialog: HTMLDialogElement,
  fixture: ProbeFixture
): () => void {
  if (
    !outer.isConnected ||
    inner.parentElement !== outer ||
    dialog.parentElement !== outer ||
    !inner.isConnected ||
    !dialog.isConnected ||
    inner.querySelector('canvas')
  ) {
    throw new Error('The web host mount boundary is not current');
  }
  if (!isProbeFixture(fixture)) throw new Error('Unknown web host hydration fixture');
  if (mountedContainers.has(inner)) throw new Error('The web host root is already mounted');
  if (fixture === 'text-mismatch' && !(typeof __DEV_HARNESS__ !== 'undefined' && __DEV_HARNESS__)) {
    throw new Error('A release web host cannot mount a text mismatch');
  }
  mountedContainers.add(inner);
  let disposed = false;
  let root: Root | undefined;
  let stopBridge: (() => void) | undefined;
  let stopModal: (() => void) | undefined;
  let diagnostics: ReturnType<typeof createProbeDiagnostics> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    outer.setAttribute(PROBE_MOUNT_STATE_ATTRIBUTE, PROBE_MOUNT_STATES.disposed);
    try {
      stopModal?.();
    } finally {
      try {
        root?.unmount();
      } finally {
        try {
          stopBridge?.();
        } finally {
          diagnostics?.dispose();
          mountedContainers.delete(inner);
        }
      }
    }
  };

  try {
    if (typeof __DEV_HARNESS__ !== 'undefined' && __DEV_HARNESS__) {
      diagnostics = createProbeDiagnostics();
    }
    const modal = bindProbeModal(dialog, inner);
    stopModal = modal.dispose;
    const bridge = createProbeBridge(modal.openDialog);
    stopBridge = bridge.dispose;
    outer.setAttribute(PROBE_MOUNT_STATE_ATTRIBUTE, PROBE_MOUNT_STATES.hydrating);
    root = hydrateRoot(
      inner,
      <ProbeChrome
        store={bridge.store}
        initialPendingLabel={fixture === 'matching' ? PROBE_PENDING_LABEL : PROBE_MISMATCH_LABEL}
        onAdopted={() => {
          if (disposed) return;
          outer.setAttribute(PROBE_MOUNT_STATE_ATTRIBUTE, PROBE_MOUNT_STATES.adopted);
          diagnostics?.adopted();
        }}
      />,
      {
        identifierPrefix: PROBE_IDENTIFIER_PREFIX,
        onRecoverableError(error) {
          diagnostics?.recovered(error);
          console.error('Web host hydration recovered', error);
        },
        onUncaughtError(error) {
          dispose();
          console.error('Web host hydration failed', error);
        },
      }
    );
    if (disposed) root.unmount();
  } catch (error) {
    dispose();
    throw error;
  }

  return dispose;
}
