function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function waitForPressFeedbackToSettle(node: HTMLElement) {
  await nextFrame();
  const animations = node.getAnimations();
  if (animations.length === 0) return;
  await Promise.allSettled(animations.map((animation) => animation.finished));
  // Removing or covering a releasing control in the same presentation turn
  // forces WebKit to retire its transform layer alongside the larger surface.
  await nextFrame();
  await nextFrame();
}
