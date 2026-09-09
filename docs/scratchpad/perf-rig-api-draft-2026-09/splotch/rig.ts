// Host-local. Lives in a gitignored local file in practice; shown here for the shape.
import { defineRig } from 'perf-rig';

export const rig = defineRig({
  outputRoot: 'perf-profiles',
  evidenceRoot: 'perf-profiles/evidence',
  ports: {
    preview: {
      port: 4173,
      onConflict: 'replace-if-ours-or-shift',
      shiftTo: [4183, 4193, 4203, 4213],
    },
    probe: {
      port: 4175,
      onConflict: 'reuse-compatible-or-shift',
      shiftTo: [4185, 4195, 4205, 4215],
    },
    appium: { port: 4723, onConflict: 'reuse-or-shift', shiftTo: [4733, 4743, 4753] },
    wda: { port: 8100, onConflict: 'shift', shiftTo: [8110, 8120, 8130] },
    androidCdp: { port: 9224, onConflict: 'shift', shiftTo: [9234, 9244] },
    inspector: { port: 9221, onConflict: 'shift', shiftTo: [9231, 9241] },
    floorControl: { port: 4177, onConflict: 'shift', shiftTo: [4187, 4197] },
  },
  devices: {
    identifierPatterns: [
      { kind: 'apple-hardware-udid', pattern: /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}/g },
      { kind: 'samsung-serial', pattern: /R5C[A-Z0-9]{8}/g },
    ],
  },
  ownership: {
    checkoutRoot: process.cwd(),
    worktreeContainers: ['.claude/worktrees', '.codex/worktrees'],
    ownedScriptPatterns: [
      /tools\/perf\/[^ ]+\.mjs/,
      /tools\/run-web-tool\.mjs vite preview/,
      /perf-rig (serve|probe-host|campaign|preflight|operator)/,
    ],
  },
  appium: { capabilitiesFile: 'perf-profiles/local/ipad-caps.json' },
  sandboxMarkerEnv: 'CODEX_SANDBOX',
  grantLog: {
    path: 'perf-profiles/evidence/operator/ipad-grant-log.tsv',
    salt: 'splotch-ipad-grant-log\0',
  },
});
