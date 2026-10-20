// Building blocks the parity slices share. `c` is the step context run-parity-slice builds.

const MENU_MS = 900;
const SETTLE_MS = 1500;
const SCROLL_TRIES = 4;
// A drag from 75% to 45% of the window height: how a slice scrolls a Settings hub that reports
// only what is on screen.
export const SCROLL_UP = [
  [0.5, 0.75],
  [0.5, 0.6],
  [0.5, 0.45],
];
const SCROLL_DOWN = [...SCROLL_UP].reverse();

export function appFrame(nodes) {
  return (nodes.find((node) => /Application|FrameLayout/.test(node.tag)) ?? nodes[0]).frame;
}

export async function setPaperFromWindow(c) {
  c.setPaper(appFrame(await c.nodes()));
}

export async function visible(c, name) {
  return (await c.nodes()).some((node) => node.name === name && node.visible !== 'false');
}

// An exact label beats a hub card whose name only starts with it.
async function findButton(c, label) {
  const buttons = (await c.nodes()).filter(
    (node) => node.visible !== 'false' && /Button/.test(node.tag)
  );
  return (
    buttons.find((node) => node.label === label || node.name === label) ??
    buttons.find((node) => node.name.startsWith(`${label},`) || node.name.startsWith(`${label} `))
  );
}

// `bothWays` also scrolls back down, for a hub that reopens where it was left and may hold the
// card above the fold; `androidOnly` scrolls only where the hub reports just what is on screen.
export async function tapLabel(c, label, { bothWays = false, androidOnly = false } = {}) {
  let hit = await findButton(c, label);
  const tries = bothWays ? 2 * SCROLL_TRIES : SCROLL_TRIES;
  for (let i = 0; !hit && !(androidOnly && c.ios) && i < tries; i += 1) {
    await c.stroke(i < SCROLL_TRIES ? SCROLL_UP : SCROLL_DOWN);
    await c.sleep(MENU_MS);
    hit = await findButton(c, label);
  }
  if (!hit) throw new Error(`no visible ${label}`);
  const { frame } = hit;
  return c.tapPoint(frame.x + frame.w / 2, frame.y + frame.h / 2, label);
}

export async function closeIfOpen(c, times = 1) {
  for (let i = 0; i < times && (await c.findName('Close')).length; i += 1) {
    await c.tap('Close');
    await c.sleep(SETTLE_MS);
  }
}
