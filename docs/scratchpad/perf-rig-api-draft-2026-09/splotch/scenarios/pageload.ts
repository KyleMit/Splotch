// perf:web:mount and perf:web:settings.
import { defineScenario } from 'perf-rig';

export const mount = defineScenario({
  kind: 'mount',
  id: 'mount',
  description:
    'Trace across the initial navigation with a buffered long-task observer; the Lighthouse-TBT window.',
  postLoadSettleMs: 10_000,
  network: 'slow-4g',
});

export const settingsFirstShow = defineScenario({
  kind: 'first-show',
  id: 'settings-first-show',
  description: 'First open of the Settings dialog scored against a reopen, per shell.',
  cycles: 3,
  shells: [
    {
      name: 'wide',
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      open: 'document.querySelector("#settingsButton").click()',
      shown:
        '!!document.querySelector("#settingsModal[open] .settings-pane .settings-section:not(.staged)")',
      warm: '!!document.querySelector(".settings-pane[aria-busy=\\"false\\"]")',
      close: {
        name: 'close-settings',
        steps: [
          {
            kind: 'evaluate',
            functionSource:
              'function close() { document.querySelector("#settingsModal").close(); }',
          },
        ],
      },
      closed: '!document.querySelector("#settingsModal[open]")',
    },
    {
      name: 'phone-hub',
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.6 },
      open: 'document.querySelector("#settingsButton").click()',
      shown: '!!document.querySelector("#settingsModal[open] .hub-row")',
      warm: '!!document.querySelector("#settingsModal .hub-row")',
      close: {
        name: 'close-settings',
        steps: [
          {
            kind: 'evaluate',
            functionSource:
              'function close() { document.querySelector("#settingsModal").close(); }',
          },
        ],
      },
      closed: '!document.querySelector("#settingsModal[open]")',
    },
  ],
});
