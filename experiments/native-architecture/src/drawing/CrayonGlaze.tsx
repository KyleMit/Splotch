import { useId, type ReactNode } from 'react';
import { Defs, FeBlend, FeComposite, Filter, G } from 'react-native-svg';
import { CRAYON_COLOR_MIX } from './crayon';
import { useInkPaper } from './InkPaper';
import { paperSize } from './paperSpace';
import type { paintAppearance } from './palette';

export function CrayonGlaze({
  children,
  mode,
}: {
  children: ReactNode;
  mode: ReturnType<typeof paintAppearance>['glaze'];
}) {
  const id = useId();
  const { width, height } = paperSize(useInkPaper());
  return (
    <>
      <Defs>
        <Filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <FeBlend in="SourceGraphic" in2="BackgroundImage" mode={mode} result="mixed" />
          <FeComposite in="mixed" in2="SourceGraphic" operator="in" />
        </Filter>
      </Defs>
      <G filter={`url(#${id})`}>{children}</G>
      <G opacity={1 - CRAYON_COLOR_MIX}>{children}</G>
    </>
  );
}
