import { useId, type ReactNode } from 'react';
import { Defs, FeBlend, FeComposite, Filter, G } from 'react-native-svg';
import { CRAYON_COLOR_MIX } from './crayon';
import { PAPER_HEIGHT, PAPER_WIDTH } from './model';

export function CrayonGlaze({ children }: { children: ReactNode }) {
  const id = useId();
  return (
    <>
      <Defs>
        <Filter
          id={id}
          filterUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={PAPER_WIDTH}
          height={PAPER_HEIGHT}
        >
          <FeBlend in="SourceGraphic" in2="BackgroundImage" mode="darken" result="mixed" />
          <FeComposite in="mixed" in2="SourceGraphic" operator="in" />
        </Filter>
      </Defs>
      <G filter={`url(#${id})`}>{children}</G>
      <G opacity={1 - CRAYON_COLOR_MIX}>{children}</G>
    </>
  );
}
