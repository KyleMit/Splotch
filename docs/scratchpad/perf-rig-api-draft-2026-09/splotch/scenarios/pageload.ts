// perf:web:settings: first show of the Settings dialog against a reopen, through declared controls.
// `presented` is each shell's first content a person can see inside the open dialog, as
// capture-settings-open.mjs waits for it: the wide pane's first unstaged section (aria-busy went
// false at prewarm, and staged sections are laid out but invisible) and the hub's rows.
import { defineScenario } from 'perf-rig';
import { splotch } from '../app.js';

export const settingsFirstShow = defineScenario(splotch, {
  kind: 'first-show',
  id: 'settings-first-show',
  description: 'First open of the Settings dialog scored against a reopen, per shell.',
  cycles: 3,
  shells: [
    {
      name: 'wide',
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
      open: 'settings',
      presented:
        '!!document.querySelector("#settingsModal[open] .settings-pane .settings-section:not(.staged)")',
      warm: '!!document.querySelector(".settings-pane[aria-busy=\\"false\\"]")',
      close: 'closeSettings',
    },
    {
      name: 'phone-hub',
      viewport: { width: 412, height: 915, deviceScaleFactor: 2.6 },
      open: 'settings',
      presented: '!!document.querySelector("#settingsModal[open] .hub-row")',
      warm: '!!document.querySelector("#settingsModal .hub-row")',
      close: 'closeSettings',
    },
  ],
});
