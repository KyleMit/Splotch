// The prototype preview rendered its 300-unit contour at 255 CSS pixels.
const PROTOTYPE_DIAMETER_PX = 255;
const PROTOTYPE_DASH_COUNT = 32;
const DASH_PITCH_PX = (Math.PI * PROTOTYPE_DIAMETER_PX) / PROTOTYPE_DASH_COUNT;

// Each authored pen mark stores where it starts and ends as fractions of its cell.
const PEN_MARKS = [
  [-0.0166, 0.5211],
  [-0.0051, 0.5047],
  [0.0014, 0.527],
  [-0.0516, 0.4824],
  [-0.0533, 0.3793],
  [-0.0264, 0.6827],
  [-0.0022, 0.5729],
  [0.0467, 0.7345],
  [0.0074, 0.4812],
  [0.0027, 0.5175],
  [0.0512, 0.4619],
  [-0.0142, 0.6058],
  [0.0113, 0.5899],
  [0.0292, 0.5057],
  [0.038, 0.7311],
  [-0.0519, 0.4549],
  [-0.0153, 0.5073],
  [0.0043, 0.4855],
  [0.0166, 0.6986],
  [0.0477, 0.7185],
  [-0.0315, 0.6065],
  [0.0306, 0.6242],
  [0.0194, 0.5114],
  [0.0305, 0.507],
  [0.0061, 0.4898],
  [0.0035, 0.4166],
  [-0.0212, 0.6285],
  [-0.0269, 0.6068],
  [0.0336, 0.6276],
  [0.0142, 0.4804],
  [-0.0017, 0.7063],
  [0.0544, 0.6331],
] as const;

export function createClearRingContours(diameterPx: number) {
  const radiusPx = diameterPx / 2;
  const dashCount = Math.max(1, Math.round((Math.PI * diameterPx) / DASH_PITCH_PX));
  const anglePerDash = (Math.PI * 2) / dashCount;
  const radius = radiusPx.toFixed(2);

  function point(angle: number) {
    return `${(radiusPx + Math.cos(angle) * radiusPx).toFixed(2)},${(radiusPx + Math.sin(angle) * radiusPx).toFixed(2)}`;
  }

  function arcTo(angle: number) {
    return `A${radius} ${radius} 0 0 1 ${point(angle)}`;
  }

  const dashes: string[] = [];
  for (let index = 0; index < dashCount; index++) {
    const [start, end] = PEN_MARKS[index % PEN_MARKS.length];
    dashes.push(`M${point((index + start) * anglePerDash)} ${arcTo((index + end) * anglePerDash)}`);
  }
  // Quarter arcs, never halves: a half-circle arc's chord equals its diameter, so the
  // separately rounded endpoints and radius can disagree by a hundredth of a pixel and
  // the browser then bows the arc by the square root of that gap, whole pixels at tablet size.
  const quarterTurns = [1, 2, 3, 4].map((quarter) => arcTo((quarter * Math.PI) / 2));
  const solid = `M${point(0)} ${quarterTurns.join(' ')}Z`;
  return { dashes: dashes.join(' '), solid };
}
