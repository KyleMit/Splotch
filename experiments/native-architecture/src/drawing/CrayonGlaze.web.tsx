import type { ReactNode } from 'react';
import { G } from 'react-native-svg';
import { CRAYON_COLOR_MIX } from './crayon';

export function CrayonGlaze({ children }: { children: ReactNode }) {
  return (
    <>
      <G style={{ mixBlendMode: 'darken' }}>{children}</G>
      <G opacity={1 - CRAYON_COLOR_MIX}>{children}</G>
    </>
  );
}
