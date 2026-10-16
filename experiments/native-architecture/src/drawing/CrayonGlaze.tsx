import { useId, type ReactNode } from 'react';
import { Defs, FeBlend, FeComposite, Filter, G } from '../platform/svg';
import { CRAYON_COLOR_MIX } from './crayon';
import { useInkBounds } from './InkPaper';
import type { paintAppearance } from './palette';

export function CrayonGlaze({
  children,
  mode,
}: {
  children: ReactNode;
  mode: ReturnType<typeof paintAppearance>['glaze'];
}) {
  const id = useId();
  const { x, y, width, height } = useInkBounds();
  return (
    <>
      <Defs>
        <Filter id={id} filterUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
          <FeBlend in="SourceGraphic" in2="BackgroundImage" mode={mode} result="mixed" />
          <FeComposite in="mixed" in2="SourceGraphic" operator="in" />
        </Filter>
      </Defs>
      <G filter={`url(#${id})`}>{children}</G>
      <G opacity={1 - CRAYON_COLOR_MIX}>{children}</G>
    </>
  );
}
