import type { LiveCohort7 } from './recordedContactCohort7';
import type { Command7, Drawing7, Op7, Style7 } from './recordedTypes7';

export type PaintOp7 = Exclude<Op7, { kind: 'crayonFlush' }>;
export type RecordedPaint7 = Readonly<{ op: PaintOp7; style: Style7 }>;
type RecordedPass7 = Readonly<{ kind: 'wax'; paints: readonly RecordedPaint7[] }>;
export type RecordedUnit7 = RecordedPass7 | Readonly<{ kind: 'paint'; paint: RecordedPaint7 }>;
export type RecordedPaintPlan7 = Readonly<{
  units: readonly RecordedUnit7[];
  openWax: readonly RecordedPaint7[];
}>;

function appendCommand7(
  command: Pick<Command7, 'styles' | 'ops'>,
  units: RecordedUnit7[],
  wax: RecordedPaint7[],
  web: boolean
) {
  for (const op of command.ops) {
    if (op.kind === 'crayonFlush') {
      if (web && wax.length) {
        units.push({ kind: 'wax', paints: wax.splice(0) });
      }
      continue;
    }
    const style = command.styles[op.contact];
    if (!style) throw new Error('The recorded paint contact is missing.');
    const crayon = op.kind === 'crayonDot' || op.kind === 'crayonPath';
    if (crayon !== (style.brush === 'crayon')) throw new Error('The recorded paint kind changed.');
    const paint = Object.freeze({ op, style });
    if (web && crayon) wax.push(paint);
    else units.push({ kind: 'paint', paint });
  }
}

export function recordedPaintPlan7(
  drawing: Drawing7,
  preview: LiveCohort7 | null,
  platform: 'web' | 'native'
): RecordedPaintPlan7 {
  const units: RecordedUnit7[] = [];
  const wax: RecordedPaint7[] = [];
  const web = platform === 'web';
  for (const command of drawing.commands) appendCommand7(command, units, wax, web);
  if (preview) appendCommand7(preview, units, wax, web);
  return Object.freeze({
    units: Object.freeze(
      units.map((unit) =>
        unit.kind === 'wax'
          ? Object.freeze({ ...unit, paints: Object.freeze(unit.paints) })
          : Object.freeze(unit)
      )
    ),
    openWax: Object.freeze(wax),
  });
}

export function recordedSceneUnits7(plan: RecordedPaintPlan7): readonly RecordedUnit7[] {
  if (!plan.openWax.length) return plan.units;
  const open: RecordedPass7 = Object.freeze({ kind: 'wax', paints: plan.openWax });
  return Object.freeze([...plan.units, open]);
}

export function recordedResourceStyles7(
  drawing: Drawing7,
  preview: LiveCohort7 | null
): readonly Style7[] {
  return [...drawing.commands.flatMap((command) => command.styles), ...(preview?.styles ?? [])];
}
