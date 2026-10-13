import pencilOne from './pencil-1.mp3';
import pencilTwo from './pencil-2.mp3';
import pencilThree from './pencil-3.mp3';

// The shipping app's three pencil scratches; each stroke plays one at random from a random point.
export const PENCIL_SOUNDS = [pencilOne, pencilTwo, pencilThree] as const;

export function pickPencilTake<T>(takes: readonly T[]): { take: T; at: number } {
  return { take: takes[Math.floor(Math.random() * takes.length)], at: Math.random() };
}

// As in the shipping scratch, a take that fails to load leaves the others playing.
export function usableTakes<T>(loads: readonly PromiseSettledResult<T>[]): T[] {
  const takes = loads.flatMap((load) => (load.status === 'fulfilled' ? [load.value] : []));
  const refused = loads.find((load) => load.status === 'rejected');
  if (takes.length === 0 && refused) throw refused.reason;
  return takes;
}
