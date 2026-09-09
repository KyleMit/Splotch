/**
 * In-page probes.
 *
 * A probe is a recorder, not an analyser: it appends numeric rows and hands them back verbatim, so
 * a capture outlives the metric definitions current when it was taken. Probes run in the page and
 * cannot import anything, so the package ships each as a template rendered from the app contract.
 * `perf-rig probe render` writes the rendered source for the paste-into-Inspector workflow.
 */

import type { AppContract } from './app.js';

export type ProbeId = 'frames' | 'actions' | 'input-recorder';

export interface RenderedProbe {
  readonly id: ProbeId;
  readonly source: string;
  /** Hash of the rendered source; part of the instrument fingerprint. */
  readonly digest: string;
  readonly schema: ProbeSchema;
}

export interface ProbeSchema {
  readonly name: ProbeId;
  readonly version: number;
  readonly tables: Readonly<Record<string, readonly string[]>>;
}

export declare function renderProbe(
  id: ProbeId,
  app: AppContract,
  config?: ProbeConfig
): RenderedProbe;

/**
 * Configuration the probe reads from window globals before it starts. The renderer assigns every
 * global, requested or not, because a leftover from an earlier run silently changes what a capture
 * measured.
 */
export interface ProbeConfig {
  readonly phases?: readonly string[];
  readonly contactMs?: number;
  readonly freeDrawSeconds?: number;
  readonly hud?: boolean;
  readonly drive?: {
    readonly shape: 'mixed' | 'long' | 'short';
    readonly hz: number;
    readonly pointerType: 'touch' | 'pen' | 'mouse';
  };
  readonly mode?: string;
}

/** Row schemas, positional, decoded by the scorer. Versioned with the package. */
export declare const FRAMES_PROBE_SCHEMA: {
  readonly name: 'frames';
  readonly version: 2;
  readonly tables: {
    readonly frames: readonly ['t', 'dt', 'contact'];
    readonly events: readonly [
      'stamp',
      'at',
      'type',
      'id',
      'buttons',
      'coalesced',
      'onCanvas',
      'kind',
      'trusted',
      'pressure',
      'width',
      'height',
      'coalescedFirst',
      'coalescedLast',
    ];
    readonly measures: readonly ['start', 'dur', 'nameIndex'];
    readonly history: readonly ['at', '...appContract.hooks.historyDepth.fields'];
    readonly liftLatencies: readonly ['at', 'waitedMs', 'phaseIndex'];
  };
};

export declare const ACTIONS_PROBE_SCHEMA: {
  readonly name: 'actions';
  readonly version: 2;
  /** Epoch 2 records the scheduled rAF stamp and the actual callback time; only the scheduled one is scored (ADR-0163). */
  readonly frameStampEpoch: 2;
  readonly tables: {
    readonly frames: readonly ['at', 'gap', 'visualEffectsActive', 'ranAt', 'actualGap'];
  };
};

export interface ProbeHandle {
  counts(): Promise<Readonly<Record<string, number>>>;
  finish(): Promise<unknown>;
  stop(): Promise<void>;
}
