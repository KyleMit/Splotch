// Replay a W3C pointer-action plan as Android `input swipe` segments.
//
// Android exposes no W3C actions endpoint outside a driver, so a gesture that is
// one `pointerDown … pointerMove* … pointerUp` run on iOS becomes a run of
// consecutive `input swipe` calls here — one per move, at the plan's own
// durations, so the same plan produces the same path on both platforms.
//
// Splitting the plan is pure, and it is where the interesting mistakes live
// (dropped first point, coordinates left in CSS pixels, a zero duration that
// makes `input swipe` fling instead of draw), so it is separated from the `adb`
// calls that execute it.

// `input swipe` interpolates over the duration it is given, and below roughly a
// frame it emits a down/up pair with no intermediate motion — a tap, not a
// stroke. This floor keeps every segment a stroke.
const MIN_SWIPE_DURATION_MS = 50;
// A move that carries no duration of its own is a plan step whose pacing did not
// matter; give it a stroke slow enough to interpolate rather than fling.
const DEFAULT_SWIPE_DURATION_MS = 200;

const toDevicePixels = (value, densityScale, origin) => Math.round(origin + value * densityScale);

// Returns an ordered instruction list — `swipe` and `pause` — rather than
// issuing anything, so a test can assert the whole gesture without a device.
export function androidGestureInstructions(
  actions,
  { densityScale = 1, offset = { x: 0, y: 0 } } = {}
) {
  const instructions = [];
  let path = [];
  let contact = false;

  for (const action of actions) {
    if (action.type === 'pause') {
      instructions.push({ kind: 'pause', durationMs: action.duration ?? 0 });
      continue;
    }
    if (action.type === 'pointerMove' && !contact) {
      // The move that precedes pointerDown is the plan positioning the finger.
      // It is the stroke's first point, not a segment of its own.
      path = [{ x: action.x, y: action.y, durationMs: 0 }];
      continue;
    }
    if (action.type === 'pointerDown') {
      contact = true;
      continue;
    }
    if (action.type === 'pointerMove' && contact) {
      path.push({ x: action.x, y: action.y, durationMs: action.duration ?? 0 });
      continue;
    }
    if (action.type === 'pointerUp') {
      contact = false;
      for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        instructions.push({
          kind: 'swipe',
          x0: toDevicePixels(from.x, densityScale, offset.x),
          y0: toDevicePixels(from.y, densityScale, offset.y),
          x1: toDevicePixels(to.x, densityScale, offset.x),
          y1: toDevicePixels(to.y, densityScale, offset.y),
          durationMs: Math.max(
            MIN_SWIPE_DURATION_MS,
            Math.round(to.durationMs || DEFAULT_SWIPE_DURATION_MS)
          ),
        });
      }
      path = [];
    }
  }
  return instructions;
}

export function swipeArgs(instruction) {
  return [
    'shell',
    'input',
    'swipe',
    String(instruction.x0),
    String(instruction.y0),
    String(instruction.x1),
    String(instruction.y1),
    String(instruction.durationMs),
  ];
}

// `user_rotation` is only honoured while accelerometer rotation is off, and a
// campaign that sets one without the other gets whichever way the device happens
// to be lying. Both settings are returned together for that reason.
const USER_ROTATION_BY_ORIENTATION = { PORTRAIT: 0, LANDSCAPE: 1 };

export function androidRotationCommands(orientation) {
  const rotation = USER_ROTATION_BY_ORIENTATION[orientation];
  if (rotation === undefined) {
    throw new Error(`orientation must be one of ${Object.keys(USER_ROTATION_BY_ORIENTATION)}`);
  }
  return [
    ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'],
    ['shell', 'settings', 'put', 'system', 'user_rotation', String(rotation)],
  ];
}

export const CHROME_PACKAGE = 'com.android.chrome';

// Rotation is asserted AFTER the browser is stopped, and the order is the whole
// point. `am force-stop` returns `user_rotation` to 0 on Samsung/Android 16, so
// rotating first and stopping second lands every landscape cell in portrait —
// the capture then aborts on the page disagreeing with the requested
// orientation, having written no artifact. Each step names the settle the caller
// must honour before the next one; the durations stay policy for the caller.
export function androidPageLaunchSteps(orientation, pageUrl) {
  const [disableAutoRotate, setRotation] = androidRotationCommands(orientation);
  return [
    { args: ['shell', 'am', 'force-stop', CHROME_PACKAGE], settle: 'appStop' },
    { args: disableAutoRotate, settle: null },
    { args: setRotation, settle: 'rotation' },
    {
      args: [
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        `'${pageUrl}'`,
        CHROME_PACKAGE,
      ],
      settle: 'page',
    },
  ];
}
