// Human-blessed eye cores for pages where nested non-face geometry is
// indistinguishable from eyes to the outline-only detector. Coordinates and
// total core counts come from the pen outline, so a changed outline fails
// closed until it is reviewed and re-annotated.
const LIGHT_EYE_ANNOTATIONS = new Map([
  [
    'creatures/mermaid-wide',
    {
      totalCores: 3,
      locations: [
        { x: 673, y: 286 },
        { x: 558, y: 286 },
      ],
    },
  ],
  ['creatures/pegasus-wide', { totalCores: 2, locations: [{ x: 639, y: 303 }] }],
  ['dinosaur/brachiosaurus-tall', { totalCores: 3, locations: [{ x: 606, y: 369 }] }],
  [
    'dinosaur/triceratops-tall',
    {
      totalCores: 5,
      locations: [
        { x: 386, y: 748 },
        { x: 619, y: 748 },
      ],
    },
  ],
  ['farm/duck-tall', { totalCores: 2, locations: [{ x: 465, y: 562 }] }],
  ['farm/duck-wide', { totalCores: 1, locations: [{ x: 587, y: 385 }] }],
  [
    'farm/pig-tall',
    {
      totalCores: 2,
      locations: [
        { x: 422, y: 791 },
        { x: 492, y: 802 },
      ],
    },
  ],
  ['objects/house-tall', { totalCores: 14, locations: [] }],
  ['objects/house-wide', { totalCores: 1, locations: [] }],
  [
    'space/astronaut-wide',
    {
      totalCores: 6,
      locations: [
        { x: 836, y: 415 },
        { x: 844, y: 408 },
        { x: 742, y: 452 },
      ],
    },
  ],
  ['space/meteor-wide', { totalCores: 7, locations: [] }],
  [
    'space/rover-tall',
    {
      totalCores: 5,
      locations: [
        { x: 490, y: 466 },
        { x: 462, y: 492 },
      ],
    },
  ],
  [
    'vehicles/garbage-tall',
    {
      totalCores: 3,
      locations: [
        { x: 109, y: 747 },
        { x: 203, y: 751 },
      ],
    },
  ],
  [
    'vehicles/garbage-wide',
    {
      totalCores: 11,
      locations: [
        { x: 503, y: 520 },
        { x: 618, y: 528 },
      ],
    },
  ],
]);

export function annotatedLightEyeCores(page, cores) {
  const annotation = LIGHT_EYE_ANNOTATIONS.get(page);
  if (annotation === undefined) return cores;
  if (cores.length !== annotation.totalCores)
    throw new Error(
      `judgeLightEyes: ${page} annotation expects ${annotation.totalCores} outline cores, found ${cores.length}`
    );

  const annotated = [];
  for (const location of annotation.locations) {
    const matches = cores.filter((core) => core.x === location.x && core.y === location.y);
    if (!matches.length)
      throw new Error(
        `judgeLightEyes: ${page} eye annotation at ${location.x},${location.y} does not match the outline`
      );
    annotated.push(...matches);
  }
  return annotated;
}
