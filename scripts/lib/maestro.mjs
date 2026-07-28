import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { hasCommand } from './proc.mjs';

// Maestro's default install location when it isn't on PATH (the curl installer
// drops it in ~/.maestro/bin).
const maestroDefaultPath = () => join(homedir(), '.maestro', 'bin', 'maestro');

// Prefer Maestro from PATH; fall back to its default install location.
// Shared by the Android and iOS smoke tests.
export const maestroPath = () => (hasCommand('maestro') ? 'maestro' : maestroDefaultPath());

// Whether Maestro is usable at all — on PATH or at its default location.
export const maestroInstalled = () => hasCommand('maestro') || existsSync(maestroDefaultPath());
