import { isPageId } from './pages';
import { readDrawingPaper } from './paperSpace';
import { createCohortRecorder7 } from './cohortRecorder7';
import {
  exact7,
  isAllocationCursor7,
  rainbow7,
  style7,
  op7,
  arrayItem7,
  mapArray7,
} from './recordedGuards7';
import { admitRecordedBounds7 } from './recordedBounds7';
import {
  MAX_CONTACTS_7,
  MAX_GEOMETRY_7,
  MAX_RETAINED_INPUTS_7,
  MAX_RETAINED_OPS_7,
  MAX_SAVED_BYTES_7,
  type Drawing7,
} from './recordedTypes7';

export function parseRecordedDrawing7(value: unknown): Drawing7 {
  admitRecordedBounds7(value);
  if (
    !exact7(value, ['version', 'paper', 'pageId', 'rainbow', 'seedCursor', 'commands']) ||
    value.version !== 7 ||
    !isPageId(value.pageId) ||
    !isAllocationCursor7(value.seedCursor) ||
    !Array.isArray(value.commands) ||
    value.commands.length > MAX_CONTACTS_7
  )
    throw new Error('Invalid v7 drawing.');
  const highWater = value.seedCursor;
  const paper = readDrawingPaper(value.paper);
  const rainbow = rainbow7(value.rainbow);
  if (paper.kind !== 'adopted' && value.commands.length)
    throw new Error('V7 ink requires adopted paper.');
  let derivedCursor = 1;
  let contacts = 0;
  let geometry = 0;
  const commands = mapArray7(value.commands, (item: unknown) => {
    if (
      !exact7(item, ['firstSeed', 'granularity', 'styles', 'moves', 'ops']) ||
      !isAllocationCursor7(item.firstSeed) ||
      item.firstSeed < derivedCursor ||
      item.firstSeed > highWater ||
      (item.granularity !== 'per-move' && item.granularity !== 'per-frame') ||
      !Array.isArray(item.styles) ||
      !item.styles.length ||
      !Array.isArray(item.moves) ||
      item.moves.length > MAX_RETAINED_INPUTS_7 ||
      !Array.isArray(item.ops) ||
      item.ops.length > MAX_RETAINED_OPS_7 ||
      paper.kind !== 'adopted'
    )
      throw new Error('Invalid v7 command.');
    contacts += item.styles.length;
    if (contacts > MAX_CONTACTS_7) throw new Error('The v7 drawing has too many contacts.');
    const styles = mapArray7(item.styles, style7);
    if (styles.some((style) => style.brush === 'magic' && style.rainbow !== rainbow))
      throw new Error('Invalid v7 magic sheet.');
    const recorder = createCohortRecorder7(paper, styles, item.granularity, item.firstSeed);
    for (let i = 0; i < item.moves.length; i++) recorder.accept(arrayItem7(item.moves, i));
    const result = recorder.finish();
    const declared = mapArray7(item.ops, (op: unknown) => op7(op, styles.length));
    if (JSON.stringify(declared) !== JSON.stringify(result.command.ops))
      throw new Error('V7 ops do not match their recorded input and allocations.');
    derivedCursor = result.seedCursor;
    geometry += result.geometry;
    if (geometry > MAX_GEOMETRY_7) throw new Error('The v7 drawing is too large.');
    return result.command;
  });
  if (highWater < derivedCursor) throw new Error('Invalid v7 allocation cursor.');
  const drawing: Drawing7 = {
    version: 7,
    paper,
    pageId: value.pageId,
    rainbow,
    seedCursor: highWater,
    commands,
  };
  if (new TextEncoder().encode(JSON.stringify(drawing)).byteLength > MAX_SAVED_BYTES_7)
    throw new Error('The v7 saved drawing is too large.');
  return drawing;
}

export function serializeRecordedDrawing7(drawing: Drawing7): string {
  return JSON.stringify(parseRecordedDrawing7(drawing));
}
