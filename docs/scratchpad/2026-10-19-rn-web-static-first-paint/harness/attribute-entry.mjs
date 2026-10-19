// Attribute the web export's entry chunk to its sources through the source map, grouped the way the
// interactivity tiers would split them. Bytes are generated columns per source (the chunk is
// minified ASCII), so the groups sum to the chunk's size.
// node attribute-entry.mjs <entry .js> <entry .js.map>
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
// Metro writes a sectioned (indexed) map; AnyMap flattens it into one.
const { AnyMap, decodedMappings } = require('@jridgewell/trace-mapping');
const [entryPath, mapPath] = process.argv.slice(2);
const code = readFileSync(entryPath, 'utf8');
const map = new AnyMap(JSON.parse(readFileSync(mapPath, 'utf8')));

// First match wins; app paths are relative to experiments/native-architecture/src.
const GROUPS = [
  ['react-dom', /node_modules\/(react-dom|scheduler)\//],
  ['react', /node_modules\/react\//],
  ['react-native-web', /node_modules\/react-native-web\//],
  ['expo runtime', /node_modules\/(expo|@expo|expo-[^/]+)\//],
  ['other libraries', /node_modules\//],
  [
    'tier 1: drawing engine',
    /src\/(drawing|ink)\/|web\/src\/lib\/drawing\/|src\/useDrawingScreen|src\/useUndoAction/,
  ],
  [
    'tier 2-3: drawing chrome',
    /src\/rsdDrawing\/|src\/clear\/|src\/useBrushPreferences|src\/useDrawingSound/,
  ],
  [
    'tier 3-4: product, settings, library',
    /src\/(product|settings|offlineLibrary|ai|feedback|parentCenter|install|information|export)\//,
  ],
  ['platform seams', /src\/platform\//],
  ['other app code', /./],
];

const bytes = new Map(GROUPS.map(([name]) => [name, 0]));
const lines = code.split('\n');
let unmapped = 0;
decodedMappings(map).forEach((segments, line) => {
  const length = lines[line]?.length ?? 0;
  if (segments.length === 0) unmapped += length;
  else unmapped += segments[0][0];
  segments.forEach((segment, index) => {
    const end = index + 1 < segments.length ? segments[index + 1][0] : length;
    const span = end - segment[0];
    if (segment.length < 2) {
      unmapped += span;
      return;
    }
    const source = map.sources[segment[1]] ?? '';
    const [name] = GROUPS.find(([, pattern]) => pattern.test(source));
    bytes.set(name, bytes.get(name) + span);
  });
});
const total = [...bytes.values()].reduce((sum, value) => sum + value, unmapped);
console.log(
  JSON.stringify(
    { entryBytes: code.length, attributed: total, unmapped, groups: Object.fromEntries(bytes) },
    null,
    1
  )
);
