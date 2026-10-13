import type { createDrawingAudio } from './drawingAudio';
import type { Point } from '../drawing/model';

export type SoundContact = {
  sample: (point: Point, timestamp: number) => void;
  end: () => void;
};
export type ContactSound = ReturnType<typeof createContactSound>;

function validSample(point: Point, timestamp: number) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(timestamp);
}

export function createContactSound(audio: ReturnType<typeof createDrawingAudio>) {
  const active = new Set<SoundContact>();
  let disposed = false;
  function interrupt() {
    for (const contact of active) contact.end();
  }
  return {
    begin(point: Point, timestamp: number): SoundContact {
      if (disposed || !validSample(point, timestamp)) return { sample() {}, end() {} };
      let previous = { point, timestamp };
      const contact: SoundContact = {
        sample(nextPoint, nextTimestamp) {
          if (
            !active.has(contact) ||
            !validSample(nextPoint, nextTimestamp) ||
            nextTimestamp < previous.timestamp
          )
            return;
          const before = previous;
          previous = { point: nextPoint, timestamp: nextTimestamp };
          if (nextPoint.x !== before.point.x || nextPoint.y !== before.point.y)
            audio.sample(nextPoint, nextTimestamp, before);
        },
        end() {
          if (active.delete(contact) && active.size === 0) audio.end();
        },
      };
      if (active.size === 0) audio.begin(point, timestamp);
      active.add(contact);
      return contact;
    },
    interrupt,
    dispose() {
      disposed = true;
      interrupt();
    },
  };
}
