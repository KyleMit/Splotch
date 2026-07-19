export const SCENE_VERSION = 'crayon-comparison-v1';
export const CANVAS = { width: 1024, height: 559, deviceScaleFactor: 1 };
export const PAPER = '#f7f4ec';
export const STROKE_WIDTH = 44;
export const SCENE_METADATA = {
  version: SCENE_VERSION,
  canvas: CANVAS,
  paper: PAPER,
  strokeWidth: STROKE_WIDTH,
  pointerType: 'pen',
  colors: {
    red: '#EC534E',
    orange: '#F89C45',
    yellow: '#F9D24F',
    green: '#8CC864',
    blue: '#62A2E9',
    purple: '#AB71E1',
  },
};

const line = (a, b, count = 60, wobble = 0) =>
  Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      x: a.x + (b.x - a.x) * t + Math.sin(t * Math.PI * 4) * wobble,
      y: a.y + (b.y - a.y) * t + Math.sin(t * Math.PI * 3) * wobble,
    };
  });
const horizontal = (y, x0 = 130, x1 = 894, step = 10) => {
  const out = [];
  for (let x = x0; x <= x1; x += step)
    out.push({ x, y: y + 8 * Math.sin((x - 110) / 105) + 3 * Math.sin((x - 110) / 31) });
  return out;
};
const polyline = (corners, samples = 12) =>
  corners.flatMap((p, i) =>
    i === corners.length - 1 ? [p] : line(p, corners[i + 1], samples).slice(0, -1)
  );

function continuousRetrace() {
  const base = horizontal(280, 120, 900).map((p, i) => ({
    x: p.x,
    y: p.y + 14 * Math.sin(i / 15),
  }));
  return [
    {
      color: '#F89C45',
      points: [
        ...base,
        ...base
          .filter((p) => p.x >= 350)
          .reverse()
          .slice(1),
        ...base.filter((p) => p.x >= 350 && p.x <= 760).slice(1),
      ],
    },
  ];
}
function liftedBuildup() {
  return [
    [150, 1],
    [280, 2],
    [410, 4],
  ].flatMap(([y, passes]) =>
    Array.from({ length: passes }, () => ({ color: '#62A2E9', points: horizontal(y) }))
  );
}
function toddlerDrawing() {
  const strokes = [];
  const ground = [455, 470, 440, 482, 450].flatMap((y, i) =>
    i % 2 ? horizontal(y, 80, 944, 12).reverse() : horizontal(y, 80, 944, 12)
  );
  strokes.push({ color: '#8CC864', points: ground });
  const house = [
    { x: 300, y: 390 },
    { x: 300, y: 245 },
    { x: 500, y: 120 },
    { x: 700, y: 245 },
    { x: 700, y: 390 },
    { x: 300, y: 390 },
  ];
  strokes.push(
    { color: '#EC534E', points: polyline(house) },
    { color: '#EC534E', points: polyline(house.slice(1, 4)) }
  );
  const rect = (x0, y0, x1, y1) =>
    polyline(
      [
        { x: x0, y: y1 },
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      8
    );
  strokes.push(
    { color: '#62A2E9', points: rect(455, 290, 545, 390) },
    { color: '#62A2E9', points: rect(335, 255, 405, 325) },
    { color: '#62A2E9', points: rect(595, 255, 665, 325) }
  );
  const spiral = Array.from({ length: 100 }, (_, i) => {
    const t = i / 99,
      a = t * Math.PI * 6,
      r = 4 + 51 * t;
    return { x: 840 + Math.cos(a) * r, y: 115 + Math.sin(a) * r };
  });
  strokes.push({ color: '#F9D24F', points: spiral });
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    strokes.push({
      color: '#F9D24F',
      points: line(
        { x: 840 + Math.cos(a) * 68, y: 115 + Math.sin(a) * 68 },
        { x: 840 + Math.cos(a) * 93, y: 115 + Math.sin(a) * 93 },
        8
      ),
    });
  }
  strokes.push({
    color: '#AB71E1',
    points: Array.from({ length: 70 }, (_, i) => {
      const t = i / 69;
      return { x: 620 + 58 * t + Math.sin(t * Math.PI * 5) * 18, y: 190 - 120 * t };
    }),
  });
  return strokes;
}

export const SCENES = [
  {
    id: '01-single-line',
    label: 'Single line',
    reference: '../crayon-brush-samples/1-line-red.webp',
    strokes: () => [{ color: '#EC534E', points: horizontal(279, 110, 914, 12) }],
  },
  {
    id: '02-continuous-retrace',
    label: 'Continuous retrace',
    reference: '../crayon-brush-samples/4-scribble-backforth-blue.webp',
    strokes: continuousRetrace,
  },
  {
    id: '03-lifted-buildup',
    label: 'Lifted buildup (1× / 2× / 4×)',
    reference: '../crayon-brush-samples/2-buildup-red.webp',
    strokes: liftedBuildup,
  },
  {
    id: '04-color-crossing',
    label: 'Multiple colors crossing',
    reference: '../crayon-brush-samples/3-cross-red-blue.webp',
    strokes: () => [
      { color: '#F9D24F', points: line({ x: 180, y: 430 }, { x: 844, y: 120 }, 80, 3) },
      { color: '#EC534E', points: horizontal(280, 100, 924) },
      { color: '#62A2E9', points: line({ x: 512, y: 70 }, { x: 512, y: 489 }, 60, 3) },
    ],
  },
  {
    id: '05-toddler-drawing',
    label: 'Full toddler drawing',
    reference: '../crayon-brush-samples/4-scribble-wild-multi.webp',
    strokes: toddlerDrawing,
  },
];

export function checkScenes() {
  const failures = [];
  const ids = new Set();
  if (SCENES.length !== 5) failures.push(`expected 5 scenes, got ${SCENES.length}`);

  for (const scene of SCENES) {
    if (ids.has(scene.id)) failures.push(`duplicate scene id: ${scene.id}`);
    ids.add(scene.id);
    const strokes = scene.strokes();
    if (!strokes.length) failures.push(`${scene.id}: no strokes`);
    for (const [strokeIndex, stroke] of strokes.entries()) {
      if (!/^#[0-9A-F]{6}$/.test(stroke.color))
        failures.push(`${scene.id}:${strokeIndex}: invalid color ${stroke.color}`);
      if (stroke.points.length < 2)
        failures.push(`${scene.id}:${strokeIndex}: fewer than 2 points`);
      for (const [pointIndex, point] of stroke.points.entries()) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
          failures.push(`${scene.id}:${strokeIndex}:${pointIndex}: non-finite point`);
        if (point.x < 0 || point.x > CANVAS.width || point.y < 0 || point.y > CANVAS.height)
          failures.push(`${scene.id}:${strokeIndex}:${pointIndex}: point outside canvas`);
      }
    }
  }

  if (SCENES[1].strokes().length !== 1)
    failures.push('continuous retrace must be one unlifted stroke');
  if (SCENES[2].strokes().length !== 7)
    failures.push('lifted buildup must contain 1 + 2 + 4 strokes');
  if (new Set(SCENES[3].strokes().map((stroke) => stroke.color)).size !== 3)
    failures.push('color crossing must use three colors');

  if (failures.length) throw new Error(`Scene self-check failed:\n- ${failures.join('\n- ')}`);
  return {
    sceneCount: SCENES.length,
    strokeCount: SCENES.reduce((sum, scene) => sum + scene.strokes().length, 0),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = checkScenes();
  console.log(
    `Scene self-check passed: ${result.sceneCount} scenes, ${result.strokeCount} strokes`
  );
}
