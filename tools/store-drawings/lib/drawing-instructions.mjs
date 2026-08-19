import {
  canvasBox,
  DRAW_STROKE_STEPS,
  pickDrawingColor,
  pickBrush,
  setStrokeSize,
  drawStroke,
} from '../../../tools/app-driver/lib/app-driver.mjs';

export function fitInstructionScene(scene, box) {
  const scale = Math.min(box.width / scene.width, box.height / scene.height);
  return {
    scale,
    x: (box.width - scene.width * scale) / 2,
    y: (box.height - scene.height * scale) / 2,
  };
}

export function sceneStrokePoints(scene, box, stroke) {
  const fit = fitInstructionScene(scene, box);
  const points = [];
  for (let index = 0; index < stroke.points.length; index += 2) {
    points.push({
      x: fit.x + stroke.points[index] * fit.scale,
      y: fit.y + stroke.points[index + 1] * fit.scale,
    });
  }
  return points;
}

export function strokeReplayPoints(points) {
  if (points.length === 0) return [];
  const replay = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    for (let step = 1; step <= DRAW_STROKE_STEPS; step++) {
      const progress = step / DRAW_STROKE_STEPS;
      replay.push({
        x: previous.x + (current.x - previous.x) * progress,
        y: previous.y + (current.y - previous.y) * progress,
      });
    }
  }
  replay.push(points.at(-1));
  return replay;
}

export function sceneStrokeReplayPoints(scene, box, canvas, stroke) {
  const offset = { x: box.x - canvas.x, y: box.y - canvas.y };
  const points = sceneStrokePoints(scene, box, stroke).map(({ x, y }) => ({
    x: x + offset.x,
    y: y + offset.y,
  }));
  return strokeReplayPoints(points);
}

async function replayInstructionScene(page, box, scene) {
  const canvas = await canvasBox(page);
  if (!canvas) throw new Error('Drawing canvas is unavailable');
  for (const stroke of scene.strokes) {
    const replay = {
      color: scene.colors[stroke.color],
      points: sceneStrokeReplayPoints(scene, box, canvas, stroke),
      size: stroke.size,
    };
    await page.evaluate((request) => {
      if (!window.__replayStroke) throw new Error('Store drawing replay seam is unavailable');
      window.__replayStroke(request);
    }, replay);
  }
}

export async function drawInstructionScene(page, box, scene, { brush, replay = 'pointer' } = {}) {
  if (brush) await pickBrush(page, brush);
  if (replay === 'engine') return replayInstructionScene(page, box, scene);
  if (replay !== 'pointer') throw new Error(`Unknown store drawing replay ${replay}`);
  let activeColor;
  let activeSize;
  for (const stroke of scene.strokes) {
    const color = scene.colors[stroke.color];
    if (brush !== 'magic' && color !== activeColor) {
      await pickDrawingColor(page, color);
      activeColor = color;
    }
    if (stroke.size !== activeSize) {
      await setStrokeSize(page, stroke.size);
      activeSize = stroke.size;
    }
    await drawStroke(page, box, sceneStrokePoints(scene, box, stroke), { finishEndpoint: true });
  }
}
