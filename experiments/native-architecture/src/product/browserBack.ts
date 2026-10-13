export const BROWSER_BACK_STATE_KEY = 'splotchBetaBackNavigation';
const GUARD_LAYER = 'guard';
const MAX_HISTORY_LAYERS = 64;

export interface BrowserHistoryPort {
  state(): unknown;
  url(): string;
  push(state: Record<string, unknown>): void;
  replace(state: Record<string, unknown>): void;
  back(): void;
  listen(listener: () => void): () => void;
}

type Marker = {
  version: 1;
  owner: string;
  runtime: string;
  url: string;
  spent: boolean;
  unwinding: boolean;
  layers: string[];
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMarker(state: unknown): Marker | null {
  const marker = record(record(state)?.[BROWSER_BACK_STATE_KEY]);
  if (
    !marker ||
    Object.keys(marker).length !== 7 ||
    marker.version !== 1 ||
    typeof marker.owner !== 'string' ||
    typeof marker.runtime !== 'string' ||
    typeof marker.url !== 'string' ||
    typeof marker.spent !== 'boolean' ||
    typeof marker.unwinding !== 'boolean' ||
    !Array.isArray(marker.layers) ||
    marker.layers.length > MAX_HISTORY_LAYERS ||
    !marker.layers.every(
      (layer: unknown, index: number) =>
        typeof layer === 'string' &&
        ((layer === GUARD_LAYER && index === 0) || /^dialog:\d+$/.test(layer))
    ) ||
    new Set(marker.layers).size !== marker.layers.length
  )
    return null;
  return marker as Marker;
}

function commonLayers(first: string[], second: string[]) {
  let count = 0;
  while (count < first.length && first[count] === second[count]) count += 1;
  return count;
}

type BrowserBackOptions = { owner: string; runtime: string; guardEligible: boolean };

class BrowserBackController {
  private readonly dialogs = new Map<string, () => void>();
  private nextDialog = 0;
  private active = false;
  private ink = false;
  private spent = false;
  private installedUrl = '';
  private current: string[] = [];
  private recovery: Marker | null = null;
  private passiveRecovery = false;
  private pendingBack = false;
  private unlisten: (() => void) | null = null;

  constructor(
    private readonly port: BrowserHistoryPort,
    private readonly options: BrowserBackOptions
  ) {}

  private marker() {
    const value = readMarker(this.port.state());
    return value?.url === this.installedUrl ? value : null;
  }

  private write(layers: string[], push: boolean) {
    const state = {
      ...record(this.port.state()),
      [BROWSER_BACK_STATE_KEY]: {
        version: 1,
        owner: this.options.owner,
        runtime: this.options.runtime,
        url: this.installedUrl,
        spent: this.spent,
        unwinding: this.pendingBack,
        layers,
      },
    };
    if (push) this.port.push(state);
    else this.port.replace(state);
    this.current = layers;
  }

  private detach() {
    this.unlisten?.();
    this.unlisten = null;
    this.recovery = null;
    this.passiveRecovery = false;
    this.pendingBack = false;
    this.current = [];
  }

  private desiredLayers() {
    if (!this.active) return [];
    return [
      ...(this.options.guardEligible && this.ink && !this.spent ? [GUARD_LAYER] : []),
      ...this.dialogs.keys(),
    ];
  }

  private reconcile() {
    if (!this.unlisten || this.recovery || this.pendingBack) return;
    if (this.port.url() !== this.installedUrl) {
      this.detach();
      return;
    }
    const actual = this.marker();
    this.current = actual?.owner === this.options.owner ? actual.layers : [];
    const desired = this.desiredLayers();
    const shared = commonLayers(this.current, desired);
    if (this.current.length > shared) {
      this.pendingBack = true;
      this.write(this.current, false);
      this.port.back();
      return;
    }
    if (!actual || actual.owner !== this.options.owner || actual.spent !== this.spent)
      this.write(this.current, false);
    for (let count = this.current.length; count < desired.length; count += 1)
      this.write(desired.slice(0, count + 1), true);
    if (!this.active && this.current.length === 0) this.detach();
  }

  private pop() {
    if (this.port.url() !== this.installedUrl) {
      this.detach();
      return;
    }
    const target = this.marker();
    if (this.recovery) {
      if (
        target?.owner === this.recovery.owner &&
        target.layers.length === this.recovery.layers.length &&
        commonLayers(target.layers, this.recovery.layers) === target.layers.length
      )
        return;
      // Validate each predecessor before another traversal; foreign route history is never skipped.
      if (
        target?.owner === this.recovery.owner &&
        target.layers.length < this.recovery.layers.length &&
        commonLayers(target.layers, this.recovery.layers) === target.layers.length &&
        target.layers.length > 0
      ) {
        this.recovery = target;
        if (!this.passiveRecovery) this.port.back();
        return;
      }
      this.recovery = null;
      this.passiveRecovery = false;
      this.write([], false);
      this.reconcile();
      return;
    }
    if (this.pendingBack) {
      if (
        target?.owner === this.options.owner &&
        target.layers.length === this.current.length &&
        commonLayers(target.layers, this.current) === target.layers.length
      )
        return;
      this.pendingBack = false;
      this.reconcile();
      return;
    }
    if (target && target.owner !== this.options.owner && target.layers.length > 0) {
      this.recovery = target;
      this.port.back();
      return;
    }
    const previous = this.current;
    this.current = target?.owner === this.options.owner ? target.layers : [];
    if (
      commonLayers(previous, this.current) === previous.length &&
      previous.length === this.current.length
    )
      return;
    const top = [...this.dialogs.values()].at(-1);
    if (
      commonLayers(previous, this.current) < previous.length &&
      previous.some((layer) => layer !== GUARD_LAYER) &&
      top
    ) {
      // Restoring before requesting close keeps guarded or asynchronous refusals protected.
      this.reconcile();
      top();
      return;
    }
    if (previous.includes(GUARD_LAYER) && !this.current.includes(GUARD_LAYER)) this.spent = true;
    this.reconcile();
  }

  start() {
    this.active = true;
    if (this.unlisten) {
      this.reconcile();
      return;
    }
    this.installedUrl = this.port.url();
    const initial = this.marker();
    this.spent ||= initial?.runtime === this.options.runtime && initial.spent;
    this.unlisten = this.port.listen(() => this.pop());
    if (initial && initial.layers.length > 0) {
      this.recovery = initial;
      this.passiveRecovery = initial.runtime === this.options.runtime && initial.unwinding;
      if (!this.passiveRecovery) this.port.back();
    } else {
      this.write([], false);
      this.reconcile();
    }
  }

  setDrawingInk(value: boolean) {
    this.ink = value;
    this.reconcile();
  }

  registerDialog(close: () => void) {
    const id = `dialog:${++this.nextDialog}`;
    this.dialogs.set(id, close);
    this.reconcile();
    return () => {
      this.dialogs.delete(id);
      this.reconcile();
    };
  }

  stop() {
    this.active = false;
    this.reconcile();
  }
}

export function createBrowserBack(port: BrowserHistoryPort, options: BrowserBackOptions) {
  return new BrowserBackController(port, options);
}

export type BrowserBackOwner = ReturnType<typeof createBrowserBack>;
