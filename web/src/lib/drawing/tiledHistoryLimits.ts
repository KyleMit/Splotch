// Import-free so E2E specs, which run under plain Node, can share these
// without loading the renderer and its $lib dependencies.

export const TILE_HISTORY_FOLD_IDLE_MS = 1_500;
// Six papers is the smallest whole-paper budget that retained all twenty
// trusted large sweeps on the target iPad; see ADR-0086.
export const TILED_UNDO_PATCH_BUDGET_PAPER_MULTIPLE = 6;
export const MIN_TILED_UNDO_COMMANDS = 2;
