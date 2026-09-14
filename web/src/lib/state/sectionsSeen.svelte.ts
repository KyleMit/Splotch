import { untrack } from 'svelte';
import {
  isSectionId,
  sectionContentStamp,
  type SectionId,
} from '$lib/components/settings/sections';
import { onDurableRestore, readString, STORAGE_KEYS, writeString } from '$lib/storage';
import { sessionCount, SETTINGS_ACTIVITY_DOTS_START_SESSION } from './sessionCounters.svelte';

type SeenStamps = Partial<Record<SectionId, string>>;

function readSeenStamps(): SeenStamps {
  const raw = readString(STORAGE_KEYS.parentSectionsSeen, null);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const stamps: SeenStamps = {};
    for (const [id, stamp] of Object.entries(parsed)) {
      if (isSectionId(id) && typeof stamp === 'string') stamps[id] = stamp;
    }
    return stamps;
  } catch {
    return {};
  }
}

let seenStamps = $state<SeenStamps>(readSeenStamps());

export function isSectionUnseen(id: SectionId): boolean {
  return seenStamps[id] !== sectionContentStamp(id);
}

export function hasSectionActivity(id: SectionId): boolean {
  return (
    sessionCount('settingsActivity') >= SETTINGS_ACTIVITY_DOTS_START_SESSION && isSectionUnseen(id)
  );
}

// Marking is a command, so it must not subscribe its caller: effects call it,
// and a tracked read of the stamps here would re-run them on their own write
// and again when a durable restore reloads the stamps.
export function markSectionSeen(id: SectionId) {
  untrack(() => {
    const contentStamp = sectionContentStamp(id);
    if (seenStamps[id] === contentStamp) return;
    seenStamps[id] = contentStamp;
    writeString(STORAGE_KEYS.parentSectionsSeen, JSON.stringify(seenStamps));
  });
}

export function reloadSectionsSeen() {
  seenStamps = readSeenStamps();
}

onDurableRestore(reloadSectionsSeen);
