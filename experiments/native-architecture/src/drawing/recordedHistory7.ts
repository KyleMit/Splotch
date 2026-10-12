import { MAX_CRAYON_SEED } from './brushes';
import { readDrawingPaper, samePaper } from './paperSpace';
import type { CompletedCohort7 } from './recordedContactCohort7';
import { MAX_CONTACTS_7, MAX_GEOMETRY_7, type Command7, type Drawing7 } from './recordedTypes7';

function freeze7<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze7(child);
    Object.freeze(value);
  }
  return value;
}

function commandGeometry7(command: Command7): number {
  const samples = command.moves.reduce(
    (sum, move) => sum + (move.kind === 'drain' ? 0 : move.samples.length),
    0
  );
  return (
    samples +
    command.ops.reduce(
      (sum, op) =>
        sum +
        (op.kind === 'crayonFlush'
          ? 0
          : op.kind === 'dot' || op.kind === 'crayonDot'
            ? 1
            : op.segments.length + 1),
      0
    )
  );
}

export function recordedGeometry7(commands: readonly Command7[]): number {
  return commands.reduce((sum, command) => sum + commandGeometry7(command), 0);
}

export function addRecordedCommand7(base: Drawing7, cohort: CompletedCohort7): Drawing7 {
  const paper = readDrawingPaper(cohort.paper);
  if (paper.kind !== 'adopted' || (base.paper.kind === 'adopted' && !samePaper(base.paper, paper)))
    throw new Error('The recorded paper reference changed.');
  if (
    !Object.isFrozen(cohort.command) ||
    !Object.isFrozen(cohort.command.styles) ||
    !Object.isFrozen(cohort.command.ops) ||
    !Object.isFrozen(cohort.command.moves)
  )
    throw new Error('The recorded contact is not sealed.');
  if (
    !Number.isSafeInteger(cohort.seedCursor) ||
    cohort.seedCursor < base.seedCursor ||
    cohort.seedCursor > MAX_CRAYON_SEED + 1
  )
    throw new Error('The recorded allocation cursor changed.');
  const command = cohort.command;
  if (command.firstSeed !== base.seedCursor)
    throw new Error('The recorded allocation start changed.');
  if (
    !command.styles.length ||
    command.styles.some((style) => style.brush === 'magic' && style.rainbow !== base.rainbow)
  )
    throw new Error('The recorded contact style changed.');
  for (const op of command.ops) {
    if (
      (op.kind === 'crayonDot' || op.kind === 'crayonPath') &&
      (op.seed < base.seedCursor || op.seed >= cohort.seedCursor)
    )
      throw new Error('The recorded pass allocation changed.');
  }
  const commands = [...base.commands, command];
  const contacts = commands.reduce((sum, entry) => sum + entry.styles.length, 0);
  const geometry = commands.reduce((sum, entry) => sum + commandGeometry7(entry), 0);
  if (contacts > MAX_CONTACTS_7 || geometry > MAX_GEOMETRY_7)
    throw new Error('This picture is full. Save it, then start a new picture.');
  const drawing: Drawing7 = {
    ...base,
    paper: base.paper.kind === 'adopted' ? base.paper : paper,
    seedCursor: cohort.seedCursor,
    commands,
  };
  return freeze7(drawing);
}
