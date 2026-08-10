import {
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

export async function drawInstructionScene(page, box, scene, { brush } = {}) {
  if (brush) await pickBrush(page, brush);
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
