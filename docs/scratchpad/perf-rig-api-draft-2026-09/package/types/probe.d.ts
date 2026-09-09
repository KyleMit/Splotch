/**
 * In-page probes.
 *
 * A probe is a recorder, not an analyser: it appends numeric rows and hands them back verbatim, so
 * a capture outlives the metric definitions current when it was taken. Probes run in the page and
 * cannot import anything, so the package ships each as a template rendered from the app contract.
 * Rendering is split from configuring: the rendered source is hashed into the instrument
 * fingerprint, the per-capture configuration prelude is not, so a campaign's cells share one
 * instrument across tools and phases.
 */

import type { AppContract } from './app.js';
import type { PaperControls } from './scenario.js';

export type ProbeId = 'frames' | 'actions' | 'input-recorder';

export interface RenderedProbe {
  readonly id: ProbeId;
  readonly source: string;
  /** Hash of template plus the contract fields it read. */
  readonly digest: string;
  readonly schema: ProbeSchema;
}

export interface ProbeSchema {
  readonly name: ProbeId;
  readonly version: number;
  /** Concrete positional layout for this rendering; `history` depends on the contract. */
  readonly tables: Readonly<Record<string, readonly string[]>>;
}

export declare function renderProbe(
  id: ProbeId,
  app: AppContract,
  paper?: PaperControls
): RenderedProbe;

/** Prefix the rendered probe with its window-global configuration. Every global is assigned, requested or not. */
export declare function configureProbe(probe: RenderedProbe, config: ProbeConfig): string;

export interface ProbeConfig {
  readonly phases: readonly { readonly key: string; readonly paper: 'blank' | 'page' }[];
  readonly contactCapMs: number;
  readonly hud: boolean;
  readonly tool?: string;
  /** Only for `input.kind: 'probe-synthetic'`. */
  readonly drive?: {
    readonly shape: 'mixed' | 'long' | 'short';
    readonly hz: number;
    readonly pointerType: 'touch' | 'pen' | 'mouse';
  };
  readonly freeDrawSeconds?: number;
}

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
    /** `['at', 'depth', ...hooks.historyDepth.extra keys]`, absent values encoded `-1`. */
    readonly history: readonly ['at', 'depth', ...string[]];
    readonly liftLatencies: readonly ['at', 'waitedMs', 'phaseIndex'];
  };
};

export type FrameStampEpoch = 1 | 2;

export declare const ACTIONS_PROBE_SCHEMA: {
  readonly name: 'actions';
  readonly version: 2;
  /** Epoch 2 records the scheduled rAF stamp and the actual callback time; only the scheduled one is scored. */
  readonly frameStampEpoch: 2;
  readonly tables: {
    readonly frames: readonly ['at', 'gap', 'visualEffectsActive', 'ranAt', 'actualGap'];
  };
};
