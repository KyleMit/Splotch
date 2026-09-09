// Host-local. Lives in a gitignored local file in practice; shown here for the shape.
import { DEFAULT_PORTS, defineRig } from 'perf-rig';

export const rig = defineRig({
  outputRoot: 'perf-profiles',
  evidenceRoot: 'perf-profiles/evidence',
  ports: DEFAULT_PORTS,
  devices: {
    identifierPatterns: [
      { kind: 'apple-hardware-udid', pattern: '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}' },
      { kind: 'samsung-serial', pattern: 'R5C[A-Z0-9]{8}' },
    ],
  },
  ownership: {
    checkoutRoot: process.cwd(),
    worktreeContainers: ['.claude/worktrees', '.codex/worktrees'],
    ownedScriptPatterns: [
      'tools/perf/[^ ]+\\.mjs',
      'tools/run-web-tool\\.mjs vite preview',
      'tools/perf-rig/',
    ],
  },
  appium: { capabilitiesFile: 'perf-profiles/local/ipad-caps.json' },
  host: {
    sandboxMarkerEnv: 'CODEX_SANDBOX',
    grantLog: {
      path: 'perf-profiles/evidence/operator/ipad-grant-log.tsv',
      salt: 'splotch-ipad-grant-log\0',
    },
  },
});
