import sharp from 'sharp';

const LOCAL_WARP_TILE_PX = 128;
const LOCAL_WARP_TILE_STRIDE_PX = 64;
const LOCAL_WARP_SEARCH_RADIUS_PX = 12;
const LOCAL_WARP_EDGE_MIN = 60;
const LOCAL_WARP_TILE_MIN_EDGES = 300;
const LOCAL_WARP_TILE_MAX_EDGES = 2000;
const LOCAL_WARP_GAIN_MIN = 1.3;
const LOCAL_WARP_GAIN_MAX = 10;
const LOCAL_WARP_ORIENTATION_DISPERSION_MIN = 0.08;
const LOCAL_WARP_SPLIT_GAIN_MIN = 1.05;
const LOCAL_WARP_SPLIT_PEAK_MAX = 3.3;
const LOCAL_WARP_SPLIT_ORIENTATION_DISPERSION_MIN = 0.2;
const LOCAL_WARP_PEAK_BOUNDARY_MARGIN_PX = 1;
const LOCAL_WARP_PEAK_FALLOFF_MAX = 0.99;
export const LOCAL_WARP_WARN_PX = 3;
export const LOCAL_WARP_MAX_PX = 4;
export const LOCAL_WARP_BASELINE_MARGIN_PX = 0.5;

const OFFSETS = [];
for (let dy = -LOCAL_WARP_SEARCH_RADIUS_PX; dy <= LOCAL_WARP_SEARCH_RADIUS_PX; dy++) {
  for (let dx = -LOCAL_WARP_SEARCH_RADIUS_PX; dx <= LOCAL_WARP_SEARCH_RADIUS_PX; dx++) {
    OFFSETS.push({ dx, dy, distanceSquared: dx * dx + dy * dy });
  }
}
OFFSETS.sort((a, b) => a.distanceSquared - b.distanceSquared);

async function grayscale(buffer) {
  const { data, info } = await sharp(buffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function edgeMap(gray, width, height) {
  const magnitude = new Float32Array(width * height);
  const gradientX = new Int16Array(width * height);
  const gradientY = new Int16Array(width * height);
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const index = y * width + x;
      const gx = gray[index + 1] - gray[index];
      const gy = gray[index + width] - gray[index];
      gradientX[index] = gx;
      gradientY[index] = gy;
      magnitude[index] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return { magnitude, gradientX, gradientY };
}

function boxBlur3(values, width, height) {
  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += values[yy * width + xx];
          count++;
        }
      }
      result[y * width + x] = sum / count;
    }
  }
  return result;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function orientationDispersion(points) {
  let sumWeight = 0;
  let sumCos = 0;
  let sumSin = 0;
  for (const point of points) {
    const angle = Math.atan2(point.gradientY, point.gradientX) * 2;
    sumWeight += point.weight;
    sumCos += point.weight * Math.cos(angle);
    sumSin += point.weight * Math.sin(angle);
  }
  return sumWeight ? 1 - Math.hypot(sumCos, sumSin) / sumWeight : 0;
}

export async function prepareLocalWarpSource(sourceBuffer) {
  const { data, width, height } = await grayscale(sourceBuffer);
  const edges = edgeMap(data, width, height);
  const columns = Math.max(
    1,
    Math.floor((width - LOCAL_WARP_TILE_PX) / LOCAL_WARP_TILE_STRIDE_PX) + 1
  );
  const rows = Math.max(
    1,
    Math.floor((height - LOCAL_WARP_TILE_PX) / LOCAL_WARP_TILE_STRIDE_PX) + 1
  );
  const tiles = [];

  for (let tileY = 0; tileY < rows; tileY++) {
    for (let tileX = 0; tileX < columns; tileX++) {
      const x0 = tileX * LOCAL_WARP_TILE_STRIDE_PX;
      const x1 = Math.min(width, x0 + LOCAL_WARP_TILE_PX);
      const y0 = tileY * LOCAL_WARP_TILE_STRIDE_PX;
      const y1 = Math.min(height, y0 + LOCAL_WARP_TILE_PX);
      const points = [];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const index = y * width + x;
          const weight = edges.magnitude[index];
          if (weight <= LOCAL_WARP_EDGE_MIN) continue;
          points.push({
            x,
            y,
            weight,
            gradientX: edges.gradientX[index],
            gradientY: edges.gradientY[index],
          });
        }
      }
      if (points.length < LOCAL_WARP_TILE_MIN_EDGES) continue;
      points.sort((a, b) => b.weight - a.weight);
      const selected = points.slice(0, LOCAL_WARP_TILE_MAX_EDGES);
      tiles.push({
        x: tileX,
        y: tileY,
        centerX: (x0 + x1) / 2,
        centerY: (y0 + y1) / 2,
        inkPixels: points.length,
        orientationDispersion: orientationDispersion(selected),
        points: selected,
      });
    }
  }

  return { width, height, columns, rows, tiles };
}

function correlationAt(tile, fillEdges, width, height, dx, dy) {
  let score = 0;
  for (const point of tile.points) {
    const x = point.x + dx;
    const y = point.y + dy;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    score += point.weight * fillEdges[y * width + x];
  }
  return score;
}

function scoreTile(tile, fillEdges, width, height) {
  let best = { dx: 0, dy: 0, score: -1 };
  let zeroScore = 0;
  let sumScore = 0;
  for (const { dx, dy } of OFFSETS) {
    const score = correlationAt(tile, fillEdges, width, height, dx, dy);
    sumScore += score;
    if (dx === 0 && dy === 0) zeroScore = score;
    if (score > best.score) best = { dx, dy, score };
  }
  const meanScore = sumScore / OFFSETS.length;
  const pastPeakScore = correlationAt(tile, fillEdges, width, height, best.dx * 2, best.dy * 2);
  return {
    x: tile.x,
    y: tile.y,
    centerX: tile.centerX,
    centerY: tile.centerY,
    dx: best.dx,
    dy: best.dy,
    magnitude: Math.hypot(best.dx, best.dy),
    inkPixels: tile.inkPixels,
    gain: zeroScore > 0 ? best.score / zeroScore : Infinity,
    peak: meanScore > 0 ? best.score / meanScore : 0,
    falloff: best.score > 0 ? pastPeakScore / best.score : Infinity,
    boundaryPeak:
      Math.max(Math.abs(best.dx), Math.abs(best.dy)) >=
      LOCAL_WARP_SEARCH_RADIUS_PX - LOCAL_WARP_PEAK_BOUNDARY_MARGIN_PX,
    orientationDispersion: tile.orientationDispersion,
  };
}

export async function scoreLocalWarp(preparedSource, fillBuffer) {
  const { data, width, height } = await grayscale(fillBuffer);
  if (width !== preparedSource.width || height !== preparedSource.height) {
    throw new Error(
      `local-warp size mismatch: source ${preparedSource.width}x${preparedSource.height}, fill ${width}x${height}`
    );
  }
  const fillEdges = boxBlur3(edgeMap(data, width, height).magnitude, width, height);
  const tiles = preparedSource.tiles.map((tile) => scoreTile(tile, fillEdges, width, height));
  const globalDx = median(tiles.map((tile) => tile.dx));
  const globalDy = median(tiles.map((tile) => tile.dy));
  for (const tile of tiles) {
    tile.localWarp = Math.hypot(tile.dx - globalDx, tile.dy - globalDy);
    const fallingPeak = tile.falloff <= LOCAL_WARP_PEAK_FALLOFF_MAX;
    const strongGain =
      fallingPeak &&
      tile.gain >= LOCAL_WARP_GAIN_MIN &&
      tile.gain < LOCAL_WARP_GAIN_MAX &&
      tile.orientationDispersion >= LOCAL_WARP_ORIENTATION_DISPERSION_MIN;
    // A duplicated edge keeps zero-offset correlation deceptively strong. Its
    // competing peaks broaden the surface, which is how the excavator piston is
    // distinguished from the pig/stegosaurus straight-line plateaus.
    const splitPeak =
      tile.localWarp >= LOCAL_WARP_MAX_PX &&
      tile.gain >= LOCAL_WARP_SPLIT_GAIN_MIN &&
      tile.gain < LOCAL_WARP_GAIN_MAX &&
      tile.peak <= LOCAL_WARP_SPLIT_PEAK_MAX &&
      fallingPeak &&
      !tile.boundaryPeak &&
      tile.orientationDispersion >= LOCAL_WARP_SPLIT_ORIENTATION_DISPERSION_MIN;
    tile.confidence = strongGain ? 'strong-gain' : splitPeak ? 'split-peak' : null;
    tile.confident = tile.confidence !== null;
    // A strong peak at the search boundary proves only a lower bound. Keep it
    // gated at the radius; weak split peaks remain too aperture-prone to clamp.
    tile.clamped = strongGain && tile.boundaryPeak && tile.localWarp >= LOCAL_WARP_MAX_PX;
    if (tile.clamped) tile.localWarp = Math.max(tile.localWarp, LOCAL_WARP_SEARCH_RADIUS_PX);
  }
  const confidentTiles = tiles.filter((tile) => tile.confident);
  const worstTile = confidentTiles.reduce(
    (worst, tile) => (!worst || tile.localWarp > worst.localWarp ? tile : worst),
    null
  );
  const warnedTiles = confidentTiles.filter((tile) => tile.localWarp >= LOCAL_WARP_WARN_PX);
  return {
    width,
    height,
    columns: preparedSource.columns,
    rows: preparedSource.rows,
    globalDx,
    globalDy,
    scoredTiles: tiles.length,
    confidentTiles: confidentTiles.length,
    warnedTiles: warnedTiles.length,
    localWarpMax: worstTile?.localWarp ?? 0,
    worstTile,
    tiles,
  };
}

export async function localWarp(sourceBuffer, fillBuffer) {
  return scoreLocalWarp(await prepareLocalWarpSource(sourceBuffer), fillBuffer);
}
