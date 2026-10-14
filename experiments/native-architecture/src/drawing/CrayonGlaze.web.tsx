import type { ReactNode } from 'react';
import { G } from '../platform/svg';
import { CRAYON_COLOR_MIX } from './crayon';
import type { paintAppearance } from './palette';

export function CrayonGlaze({
  children,
  mode,
}: {
  children: ReactNode;
  mode: ReturnType<typeof paintAppearance>['glaze'];
}) {
  return (
    <>
      <G style={{ mixBlendMode: mode }}>{children}</G>
      <G opacity={1 - CRAYON_COLOR_MIX}>{children}</G>
    </>
  );
}
