const DEPTH_CORNER_OPERATIONS = 995;

const line = (brush, color, y) => ({
  brush,
  color,
  points: [120, 680].map((x) => ({ x, y })),
});
const cornerErase = () => ({ brush: 'eraser', points: [{ x: 960, y: 740 }] });
const cornerPaint = () => ({ brush: 'marker', color: 'Green', points: [{ x: 960, y: 690 }] });
const drawing = (strokes) => ({ version: 3, pageId: 'blank', rainbow: 3, strokes });

export function checkpointFixtures() {
  const rich = [
    line('pencil', 'Purple', 140),
    line('marker', 'Red', 200),
    {
      brush: 'crayon',
      color: 'Blue',
      seed: 4294967295,
      points: line('crayon', 'Blue', 300).points,
    },
    {
      brush: 'crayon',
      color: 'Yellow',
      seed: 17,
      points: [240, 360].map((y) => ({ x: 400, y })),
    },
    {
      brush: 'magic',
      rainbow: 3,
      points: [120, 680].map((x) => ({ x, y: 450 })),
    },
  ];
  const red = line('marker', 'Red', 200);
  const causal = [
    ['magic', [rich[4]]],
    ['crayon-magic', rich.slice(2)],
  ].flatMap(([group, prefix]) =>
    [false, true].map((masked) => ({
      name: `${group}-${masked ? 'disjoint-mask' : 'bare'}`,
      masked,
      prefix,
      drawing: drawing(masked ? [...prefix, cornerErase()] : prefix),
    }))
  );
  return {
    reference: drawing(rich),
    roundtrip: drawing([...rich, cornerErase(), cornerPaint(), cornerErase()]),
    redreference: drawing([red]),
    futureink: drawing([
      line('marker', 'Blue', 200),
      { brush: 'eraser', points: red.points },
      red,
      cornerErase(),
    ]),
    failure: drawing([red]),
    depth: drawing([
      ...rich,
      ...Array.from({ length: DEPTH_CORNER_OPERATIONS }, (_, index) =>
        index % 2 ? cornerPaint() : cornerErase()
      ),
    ]),
    causal,
  };
}
