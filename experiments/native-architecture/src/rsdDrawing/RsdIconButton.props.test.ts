import { expectTypeOf, it } from 'vitest';
import type { IconButtonProps } from './RsdIconButton';
import type { ScreenshotFeedback } from '../useSavePicture';
import type { UnavailableFeedback, UndoFeedback } from '../drawing/undoFeedback';

type Tile = { skin: 'tile'; icon: 'undo'; label: string; size: number; onPress: () => void };
type CaptureCue = { captureFeedback: ScreenshotFeedback | null };
type UndoCue = {
  undoFeedback: UndoFeedback | null;
  unavailable: boolean;
  unavailableFeedback: UnavailableFeedback | null;
};

it('keeps camera and Undo cues in mutually exclusive tile variants', () => {
  expectTypeOf<Tile>().toExtend<IconButtonProps>();
  expectTypeOf<Tile & CaptureCue>().toExtend<IconButtonProps>();
  expectTypeOf<Tile & UndoCue>().toExtend<IconButtonProps>();
  expectTypeOf<Tile & CaptureCue & UndoCue>().not.toExtend<IconButtonProps>();
  expectTypeOf<
    Tile & { captureFeedback: null; undoFeedback: null }
  >().not.toExtend<IconButtonProps>();
});

it('gives only the Undo tile, with both of its cues, a press that answers while unavailable', () => {
  expectTypeOf<Tile & { undoFeedback: null }>().not.toExtend<IconButtonProps>();
  expectTypeOf<Tile & { unavailable: true }>().not.toExtend<IconButtonProps>();
  expectTypeOf<
    Tile & CaptureCue & { unavailable: true; unavailableFeedback: null }
  >().not.toExtend<IconButtonProps>();
});
