import { useEffect, type ReactNode } from 'react';
import { installAppSurface } from './appSurface';

export function AppSurfaceRoot({ active, children }: { active: boolean; children: ReactNode }) {
  useEffect(() => {
    if (active) return installAppSurface();
  }, [active]);
  return children;
}
