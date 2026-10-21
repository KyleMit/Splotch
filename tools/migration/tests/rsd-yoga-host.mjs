import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// React Native's own Yoga, compiled from the installed react-native's ReactCommon sources, so a
// layout question is answered by the engine Android and iOS lay out with rather than by a model of
// it. One binary answers two questions, so a test run compiles Yoga once: `track` lays out a row
// track with padding and gaps, its flexing cells and one absolute child pinned at zero on one edge,
// and prints every child's physical left offset; `chain` nests absolute nodes from their styles and
// prints each one's physical frame in the root's coordinates.
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
#include <string>

static YGDirection directionNamed(const char* name) {
  return std::strcmp(name, "rtl") == 0 ? YGDirectionRTL
      : std::strcmp(name, "ltr") == 0 ? YGDirectionLTR
      : YGDirectionInherit;
}

static const struct { const char* name; YGEdge edge; } EDGES[] = {
  {"left", YGEdgeLeft}, {"right", YGEdgeRight}, {"top", YGEdgeTop}, {"bottom", YGEdgeBottom},
  {"start", YGEdgeStart}, {"end", YGEdgeEnd},
};

// One node's style as key=value pairs joined by ';'. A trailing '%' makes a size a percentage.
static void applyStyle(YGNodeRef node, char* spec) {
  YGNodeStyleSetPositionType(node, YGPositionTypeAbsolute);
  for (char* pair = std::strtok(spec, ";"); pair; pair = std::strtok(nullptr, ";")) {
    char* value = std::strchr(pair, '=');
    *value++ = 0;
    const float number = std::atof(value);
    const bool percent = value[std::strlen(value) - 1] == '%';
    if (std::strcmp(pair, "direction") == 0) YGNodeStyleSetDirection(node, directionNamed(value));
    else if (std::strcmp(pair, "width") == 0)
      percent ? YGNodeStyleSetWidthPercent(node, number) : YGNodeStyleSetWidth(node, number);
    else if (std::strcmp(pair, "height") == 0)
      percent ? YGNodeStyleSetHeightPercent(node, number) : YGNodeStyleSetHeight(node, number);
    else if (std::strcmp(pair, "minWidth") == 0) YGNodeStyleSetMinWidth(node, number);
    else if (std::strcmp(pair, "minHeight") == 0) YGNodeStyleSetMinHeight(node, number);
    else
      for (const auto& entry : EDGES)
        if (std::strcmp(pair, entry.name) == 0) YGNodeStyleSetPosition(node, entry.edge, number);
  }
}

// React Native lays out with every erratum on and rounds to the screen's device pixels.
static int chain(int argc, char** argv) {
  YGConfigRef config = YGConfigNew();
  YGConfigSetErrata(config, YGErrataAll);
  YGConfigSetPointScaleFactor(config, std::atof(argv[5]));
  YGNodeRef root = YGNodeNewWithConfig(config);
  YGNodeStyleSetWidth(root, std::atof(argv[2]));
  YGNodeStyleSetHeight(root, std::atof(argv[3]));
  YGNodeRef parent = root;
  for (int index = 6; index < argc; index++) {
    YGNodeRef node = YGNodeNewWithConfig(config);
    applyStyle(node, argv[index]);
    YGNodeInsertChild(parent, node, 0);
    parent = node;
  }
  YGNodeCalculateLayout(root, YGUndefined, YGUndefined, directionNamed(argv[4]));
  float left = 0, top = 0;
  for (YGNodeRef node = root; YGNodeGetChildCount(node) > 0;) {
    node = YGNodeGetChild(node, 0);
    left += YGNodeLayoutGetLeft(node);
    top += YGNodeLayoutGetTop(node);
    std::printf(
        "%.9g %.9g %.9g %.9g\n", left, top, YGNodeLayoutGetWidth(node), YGNodeLayoutGetHeight(node));
  }
  YGNodeFreeRecursive(root);
  YGConfigFree(config);
  return 0;
}

static int track(char** argv) {
  const float width = std::atof(argv[2]);
  const int cells = std::atoi(argv[3]);
  const float inset = std::atof(argv[4]);
  const YGDirection direction = directionNamed(argv[5]);
  const char* edgeName = argv[6];
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

int main(int argc, char** argv) {
  return std::strcmp(argv[1], "chain") == 0 ? chain(argc, argv) : track(argv);
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
    'track',
    String(width),
    String(cells),
    String(inset),
    direction,
    edge,
  ]).toString();
  const [thumb, ...cellLefts] = printed.trim().split(' ').map(Number);
  return { thumb, cells: cellLefts };
}

const yogaStyle = (style) =>
  Object.entries(style)
    .map(([key, value]) => `${key}=${value}`)
    .join(';');

// Nests one absolute node per style inside a root of the given size laid out in `direction` at
// `scale` device pixels per point, and returns each node's physical frame in the root's coordinates, outermost first. A style carries
// Yoga keys only: direction, the six edges, width, height (a '%' string is a percentage),
// minWidth and minHeight.
export function yogaChainLayout({ width, height, direction, scale, styles }) {
  const printed = execFileSync(compiled(), [
    'chain',
    String(width),
    String(height),
    direction,
    String(scale),
    ...styles.map(yogaStyle),
  ]).toString();
  return printed
    .trim()
    .split('\n')
    .map((line) => {
      const [left, top, frameWidth, frameHeight] = line.split(' ').map(Number);
      return { left, top, width: frameWidth, height: frameHeight };
    });
}
