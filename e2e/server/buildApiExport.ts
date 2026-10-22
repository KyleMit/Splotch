import { execFileSync } from 'node:child_process';
import { parseNumberFlag, TCP_PORT } from '../../tools/lib/proc.mjs';

export default function buildApiExport(): void {
  parseNumberFlag('SPLOTCH_E2E_PORT', process.env.SPLOTCH_E2E_PORT ?? '', TCP_PORT);
  if (!process.env.SPLOTCH_E2E_PREBUILT)
    execFileSync('npm', ['run', 'build:site'], { stdio: 'inherit' });
}
