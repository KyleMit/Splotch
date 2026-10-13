import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// React Native's own Yoga, compiled from the installed react-native's ReactCommon sources, so a
// layout question is answered by the engine Android and iOS lay out with rather than by a model of
// it. The binary lays out a row track with padding and gaps, its flexing cells and one absolute
// child pinned at zero on one edge, and prints every child's physical left offset.
const require = createRequire(import.meta.url);
const reactNative = dirname(
  require.resolve('react-native/package.json', {
    paths: [join(import.meta.dirname, '../../../experiments/native-architecture')],
  })
);
const YOGA_ROOT = join(reactNative, 'ReactCommon/yoga');
const { version } = require(join(reactNative, 'package.json'));

const HARNESS = String.raw`
#include <yoga/Yoga.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>

int main(int argc, char** argv) {
  const float width = std::atof(argv[1]);
  const int cells = std::atoi(argv[2]);
  const float inset = std::atof(argv[3]);
  const YGDirection direction = std::strcmp(argv[4], "rtl") == 0 ? YGDirectionRTL : YGDirectionLTR;
  const char* edgeName = argv[5];
  const YGEdge edge = std::strcmp(edgeName, "start") == 0 ? YGEdgeStart
      : std::strcmp(edgeName, "end") == 0 ? YGEdgeEnd
      : std::strcmp(edgeName, "right") == 0 ? YGEdgeRight
      : YGEdgeLeft;
  YGNodeRef track = YGNodeNew();
  YGNodeStyleSetFlexDirection(track, YGFlexDirectionRow);
  YGNodeStyleSetWidth(track, width);
  YGNodeStyleSetPadding(track, YGEdgeAll, inset);
  YGNodeStyleSetGap(track, YGGutterAll, inset);
  YGNodeRef thumb = YGNodeNew();
  YGNodeStyleSetPositionType(thumb, YGPositionTypeAbsolute);
  YGNodeStyleSetPosition(thumb, YGEdgeTop, 0);
  YGNodeStyleSetPosition(thumb, YGEdgeBottom, 0);
  YGNodeStyleSetPosition(thumb, edge, 0);
  YGNodeStyleSetWidth(thumb, (width - 2 * inset - (cells - 1) * inset) / cells);
  YGNodeInsertChild(track, thumb, 0);
  for (int index = 0; index < cells; index++) {
    YGNodeRef cell = YGNodeNew();
    YGNodeStyleSetFlexGrow(cell, 1);
    YGNodeStyleSetFlexShrink(cell, 1);
    YGNodeStyleSetFlexBasis(cell, 0);
    YGNodeStyleSetHeight(cell, 48);
    YGNodeInsertChild(track, cell, index + 1);
  }
  YGNodeCalculateLayout(track, YGUndefined, YGUndefined, direction);
  for (size_t index = 0; index < YGNodeGetChildCount(track); index++)
    std::printf("%s%g", index == 0 ? "" : " ", YGNodeLayoutGetLeft(YGNodeGetChild(track, index)));
  std::printf("\n");
  YGNodeFreeRecursive(track);
  return 0;
}
`;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.cpp')
        ? [join(dir, entry.name)]
        : []
  );
}

let binary;
function compiled() {
  if (binary) return binary;
  // Keyed by the react-native version and the harness, so a later run reuses an unchanged build.
  const key = createHash('sha256').update(version).update(HARNESS).digest('hex').slice(0, 16);
  const dir = join(tmpdir(), `splotch-yoga-${key}`);
  const ready = join(dir, 'thumb-layout');
  if (existsSync(ready)) return (binary = ready);
  mkdirSync(dir, { recursive: true });
  const harness = join(dir, 'thumb-layout.cpp');
  writeFileSync(harness, HARNESS);
  const output = join(dir, `thumb-layout-${process.pid}`);
  execFileSync(
    'c++',
    [
      '-std=c++20',
      '-O1',
      `-I${YOGA_ROOT}`,
      ...sources(join(YOGA_ROOT, 'yoga')),
      harness,
      '-o',
      output,
    ],
    { stdio: 'pipe' }
  );
  renameSync(output, ready);
  binary = ready;
  return binary;
}

// Lays out the track and returns the absolute child's physical left, then each cell's.
export function yogaTrackLayout({ width, cells, inset, direction, edge }) {
  const printed = execFileSync(compiled(), [
    String(width),
    String(cells),
    String(inset),
    direction,
    edge,
  ]).toString();
  const [thumb, ...cellLefts] = printed.trim().split(' ').map(Number);
  return { thumb, cells: cellLefts };
}
