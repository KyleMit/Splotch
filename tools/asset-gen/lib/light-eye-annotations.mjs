// Human-blessed eye cores for pages where nested non-face geometry is
// indistinguishable from eyes to the outline-only detector. Coordinates come
// from the pen outline, so a changed outline fails closed until it is reviewed
// and re-annotated.
const LIGHT_EYE_CORE_LOCATIONS = new Map([
  [
    'creatures/mermaid-wide',
    [
      { x: 673, y: 286 },
      { x: 558, y: 286 },
    ],
  ],
  ['creatures/pegasus-wide', [{ x: 639, y: 303 }]],
  ['dinosaur/brachiosaurus-tall', [{ x: 606, y: 369 }]],
  [
    'dinosaur/triceratops-tall',
    [
      { x: 386, y: 748 },
      { x: 619, y: 748 },
    ],
  ],
  ['farm/duck-tall', [{ x: 465, y: 562 }]],
  ['farm/duck-wide', [{ x: 587, y: 385 }]],
  ['objects/house-tall', []],
  ['objects/house-wide', []],
  ['space/meteor-wide', []],
  [
    'space/rover-tall',
    [
      { x: 490, y: 466 },
      { x: 462, y: 492 },
    ],
  ],
  [
    'vehicles/garbage-tall',
    [
      { x: 109, y: 747 },
      { x: 203, y: 751 },
    ],
  ],
  [
    'vehicles/garbage-wide',
    [
      { x: 503, y: 520 },
      { x: 618, y: 528 },
    ],
  ],
]);

export function annotatedLightEyeCores(page, cores) {
  const locations = LIGHT_EYE_CORE_LOCATIONS.get(page);
  if (locations === undefined) return cores;

  const annotated = [];
  for (const location of locations) {
    const matches = cores.filter((core) => core.x === location.x && core.y === location.y);
    if (!matches.length)
      throw new Error(
        `judgeLightEyes: ${page} eye annotation at ${location.x},${location.y} does not match the outline`
      );
    annotated.push(...matches);
  }
  return annotated;
}
