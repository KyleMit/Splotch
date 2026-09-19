// Compares pixelCheck hashes between the control and treatment run of a set:
// the pre-undo tile state, then the ghost and tiles at every undo's first frame.
//   node compare-pixels.mjs runs/<set>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

for (const dir of process.argv.slice(2)) {
  const runs = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const run = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return [run.label.split('-').at(-1), run.result];
      })
  );
  const { ctl, trt } = runs;
  const same = (key) => ctl.undos.filter((u, i) => u.pixels[key] === trt.undos[i]?.pixels[key]).length;
  console.log(
    `${dir}: pre-undo tiles ${ctl.tilesBeforeUndo === trt.tilesBeforeUndo ? 'identical' : 'DIFFER'}; ` +
      `ghosts identical ${same('ghost')}/${ctl.undos.length}; tiles identical ${same('tiles')}/${ctl.undos.length}; ` +
      `ink after undo ${ctl.nonTransparentAfterUndo} vs ${trt.nonTransparentAfterUndo}`
  );
}
