import { Circle, Path } from '../platform/svg';
import { strokePath, type Point } from './model';

export function StrokeShape({
  points,
  lead,
  width,
  paint,
}: {
  points: readonly Point[];
  lead?: Point;
  width: number;
  paint: string;
}) {
  const first = points[0];
  if (!first) return null;
  return points.length === 1 ? (
    <Circle cx={first.x} cy={first.y} r={width / 2} fill={paint} />
  ) : (
    <Path
      d={strokePath(points, lead)}
      stroke={paint}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}
