import type { Stroke } from './model';
import type { ContactCohort } from './contactCohort';

// The live cohort as the ink layer sees it. Native ink flushes it into ops as each packet arrives
// (ADR-0178), so a stroke's ops are the flushes it was painted in; the web renderer reads drafts.
export type LiveInkSource = Pick<ContactCohort, 'drafts' | 'live' | 'flush'>;
// 'sample': new samples to paint now, or by the next display frame. 'settle': a contact is ending or the
// cohort is being interrupted, so everything sampled so far must be painted now.
type LiveInkEvent = 'sample' | 'settle';

// The contact responder publishes every packet here and the ink layer subscribes, so following a
// finger never renders the drawing surface (the halo feed's pattern).
export type LiveInkFeed = Readonly<{
  connect: (source: LiveInkSource) => void;
  source: () => LiveInkSource | null;
  publish: () => void;
  settle: () => void;
  drafts: () => readonly Stroke[];
  subscribe: (listener: (event: LiveInkEvent) => void) => () => void;
}>;

const NO_DRAFTS: readonly Stroke[] = [];

export function createLiveInkFeed(): LiveInkFeed {
  let source: LiveInkSource | null = null;
  let drafts: readonly Stroke[] | null = NO_DRAFTS;
  const listeners = new Set<(event: LiveInkEvent) => void>();
  function emit(event: LiveInkEvent) {
    drafts = null;
    for (const listener of listeners) listener(event);
  }
  return {
    connect(next) {
      source = next;
      drafts = null;
    },
    source: () => source,
    publish: () => emit('sample'),
    settle: () => emit('settle'),
    drafts() {
      drafts ??= source?.drafts() ?? NO_DRAFTS;
      return drafts;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
