// The prototype preview rendered its 300-unit contour at 255 CSS pixels.
const PROTOTYPE_DIAMETER_PX = 255;
const PROTOTYPE_DASH_COUNT = 32;
const DASH_PITCH_PX = (Math.PI * PROTOTYPE_DIAMETER_PX) / PROTOTYPE_DASH_COUNT;

// Each authored pen mark stores four polar control points: cell fraction, radial offset in pixels.
const PEN_MARKS = [
  [-0.0166, 0.0007, 0.1607, 0.7099, 0.3382, -0.681, 0.5211, 0.0037],
  [-0.0051, 0.6782, 0.163, 0.0556, 0.3312, -0.7345, 0.5047, 0.6836],
  [0.0014, 0.7306, 0.1748, -0.6448, 0.3483, -0.1099, 0.527, 0.733],
  [-0.0516, 0.1131, 0.1246, -0.7539, 0.3008, 0.6151, 0.4824, 0.1103],
  [-0.0533, -0.6073, 0.0894, -0.1679, 0.2323, 0.7693, 0.3793, -0.6111],
  [-0.0264, -0.7761, 0.2075, 0.5765, 0.4416, 0.2248, 0.6827, -0.7746],
  [-0.0022, -0.2274, 0.1877, 0.7864, 0.3773, -0.5374, 0.5729, -0.2294],
  [0.0467, 0.5279, 0.2735, 0.2777, 0.5007, -0.8026, 0.7345, 0.531],
  [0.0074, 0.7991, 0.164, -0.4867, 0.3202, -0.3268, 0.4812, 0.8017],
  [0.0027, 0.3363, 0.1724, -0.8058, 0.3425, 0.4415, 0.5175, 0.3287],
  [0.0512, -0.4412, 0.1868, -0.3778, 0.3223, 0.8096, 0.4619, -0.4353],
  [-0.0142, -0.8091, 0.1905, 0.3909, 0.3951, 0.4252, 0.6058, -0.8059],
  [0.0113, -0.4337, 0.2021, 0.809, 0.393, -0.344, 0.5899, -0.4362],
  [0.0292, 0.3402, 0.1865, 0.4811, 0.3436, -0.7986, 0.5057, 0.34],
  [0.038, 0.8009, 0.267, -0.2877, 0.4955, -0.5262, 0.7311, 0.7998],
  [-0.0519, 0.5283, 0.1152, -0.7869, 0.2825, 0.2369, 0.4549, 0.5286],
  [-0.0153, -0.2289, 0.1572, -0.5685, 0.3296, 0.7785, 0.5073, -0.2361],
  [0.0043, -0.774, 0.1632, 0.1792, 0.3219, 0.602, 0.4855, -0.7764],
  [0.0166, -0.6028, 0.2416, 0.7576, 0.4668, -0.121, 0.6986, -0.6114],
  [0.0477, 0.1195, 0.2691, 0.6428, 0.4903, -0.7374, 0.7185, 0.1215],
  [-0.0315, 0.7405, 0.179, -0.0668, 0.3897, -0.6759, 0.6065, 0.7388],
  [0.0306, 0.6728, 0.2265, -0.718, 0.4222, 0.0162, 0.6242, 0.6733],
  [0.0194, -0.0089, 0.1819, -0.7012, 0.3443, 0.6884, 0.5114, -0.007],
  [0.0305, -0.6842, 0.1878, -0.0489, 0.3449, 0.7277, 0.507, -0.6813],
  [0.0061, -0.7309, 0.1659, 0.6545, 0.3256, 0.0991, 0.4898, -0.7318],
  [0.0035, -0.1105, 0.1399, 0.7511, 0.276, -0.6198, 0.4166, -0.1105],
  [-0.0212, 0.6158, 0.1933, 0.1645, 0.4078, -0.7703, 0.6285, 0.6133],
  [-0.0269, 0.7761, 0.1823, -0.5746, 0.3913, -0.2112, 0.6068, 0.7715],
  [0.0336, 0.2239, 0.2298, -0.7858, 0.4256, 0.5357, 0.6276, 0.216],
  [0.0142, -0.5332, 0.1682, -0.275, 0.322, 0.799, 0.4804, -0.5356],
  [-0.0017, -0.7942, 0.232, 0.4951, 0.4658, 0.3248, 0.7063, -0.7959],
  [0.0544, -0.3302, 0.2452, 0.8031, 0.4363, -0.4466, 0.6331, -0.3246],
] as const;

export function createClearRingContours(diameterPx: number) {
  const radiusPx = diameterPx / 2;
  const dashCount = Math.max(1, Math.round((Math.PI * diameterPx) / DASH_PITCH_PX));
  const anglePerDash = (Math.PI * 2) / dashCount;
  const radius = radiusPx.toFixed(2);

  function point(angle: number, deviationPx = 0) {
    const distance = radiusPx + deviationPx;
    return `${(radiusPx + Math.cos(angle) * distance).toFixed(2)},${(radiusPx + Math.sin(angle) * distance).toFixed(2)}`;
  }

  const dashes: string[] = [];
  for (let index = 0; index < dashCount; index++) {
    const mark = PEN_MARKS[index % PEN_MARKS.length];
    const points: string[] = [];
    for (let control = 0; control < mark.length; control += 2) {
      points.push(point((index + mark[control]) * anglePerDash, mark[control + 1]));
    }
    dashes.push(`M${points[0]} C${points.slice(1).join(' ')}`);
  }

  // Quarter arcs, never halves: a half-circle arc's chord equals its diameter, so the
  // separately rounded endpoints and radius can disagree by a hundredth of a pixel and
  // the browser then bows the arc by the square root of that gap, whole pixels at tablet size.
  const quarterTurns = [1, 2, 3, 4].map(
    (quarter) => `A${radius} ${radius} 0 0 1 ${point((quarter * Math.PI) / 2)}`
  );
  const solid = `M${point(0)} ${quarterTurns.join(' ')}Z`;
  return { dashes: dashes.join(' '), solid };
}
