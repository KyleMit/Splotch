// The three operator steps: arm the iPad automation grant, then real-finger calibration captures
// inside each installed Capacitor WebView through the same split channel a driven run uses.
import { capture } from 'perf-rig';
import type { OperatorStep } from 'perf-rig/rig';
import { splotch, type Brush } from './app.js';
import { targets } from './targets.js';
import { gates } from './gates.js';
import { drawingCell } from './scenarios/drawing.js';

const handCapture = (platform: 'ios' | 'android', brush: Brush): OperatorStep => ({
  id: `${platform}-hand`,
  platform,
  instructions: [
    platform === 'ios'
      ? 'Hold the iPad in the requested orientation; the opener does not rotate it.'
      : 'The phone buzzes once to start and twice to stop.',
    'Draw on the paper with one finger the way a toddler scribbles, for the whole window.',
  ],
  run: async ({ capture: options }) => {
    const result = await capture({
      app: splotch,
      target: targets[platform === 'ios' ? 'ipad-device-packaged' : 'android-device-packaged'],
      scenario: drawingCell(brush),
      gates,
      options: {
        ...options,
        transport: {
          input: 'human',
          channel: platform === 'ios' ? 'preferences-mailbox' : 'http-upload',
        },
      },
    });
    return { status: result.exitCode === 0 ? 'pass' : 'fail', detail: result.artifactPath };
  },
});

export const operatorSteps = (
  brushes: readonly Brush[] = ['pen', 'crayon']
): readonly OperatorStep[] => [
  {
    id: 'grant',
    platform: 'ios',
    instructions: [
      'Watch the iPad: the passcode / Enable UI Automation prompt exists only while WebDriverAgent launches.',
    ],
    run: async () => ({
      status: 'pass',
      detail:
        'the package arms the grant through a WDA launch and appends to the tracked grant log',
    }),
  },
  ...brushes.flatMap((brush) => [handCapture('android', brush), handCapture('ios', brush)]),
];
