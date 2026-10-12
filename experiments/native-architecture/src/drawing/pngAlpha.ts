import { openPng } from './pngBytes';
import { inflatePng } from './pngInflate';
import { createPngWork } from './pngWork';
import { EMPTY_ALPHA_THRESHOLD, type PngGrid } from './pngLimits';

const CHANNELS = 4;
function paeth(a: number, b: number, c: number) {
  const estimate = a + b - c;
  const da = Math.abs(estimate - a),
    db = Math.abs(estimate - b),
    dc = Math.abs(estimate - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

export function createPngAlphaDecoder() {
  let active = false;
  return {
    async decode(base64: string, grid: PngGrid, isCurrent: () => boolean): Promise<boolean> {
      if (active) throw new Error('A picture observation is still settling.');
      active = true;
      try {
        const work = createPngWork(isCurrent);
        work.check();
        const png = await openPng(base64, grid, work);
        const rowBytes = png.width * CHANNELS;
        let row = new Uint8Array(rowBytes),
          previous = new Uint8Array(rowBytes);
        let column = -1,
          filter = 0,
          empty = true;
        work.phase('inflating');
        await inflatePng(
          png.read,
          png.height * (rowBytes + 1),
          (value) => {
            if (column === -1) {
              if (value > 4) throw new Error('PNG scanline has an invalid filter.');
              filter = value;
              column = 0;
              return;
            }
            let predictor = 0;
            if (filter === 2) predictor = previous[column];
            else if (filter !== 0) {
              const left = column >= CHANNELS ? row[column - CHANNELS] : 0;
              if (filter === 1) predictor = left;
              else {
                const up = previous[column];
                predictor =
                  filter === 3
                    ? Math.floor((left + up) / 2)
                    : paeth(left, up, column >= CHANNELS ? previous[column - CHANNELS] : 0);
              }
            }
            row[column] = (value + predictor) & 255;
            if (column % CHANNELS === CHANNELS - 1 && row[column] >= EMPTY_ALPHA_THRESHOLD)
              empty = false;
            column++;
            if (column === rowBytes) {
              const completed = row;
              row = previous;
              previous = completed;
              column = -1;
            }
          },
          work
        );
        work.phase('completing');
        await png.complete();
        work.check();
        return empty;
      } finally {
        active = false;
      }
    },
  };
}
