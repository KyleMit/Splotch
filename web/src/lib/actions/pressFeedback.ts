function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function runSingleFlightActivation(
  button: HTMLButtonElement,
  activate: () => void | Promise<void>
) {
  if (button.disabled) return false;

  button.disabled = true;
  button.classList.add('activation-pending');
  let activated = false;
  try {
    // The state above is committed synchronously. One frame presents it; the
    // following callback can retire the control without waiting out its CSS.
    await nextFrame();
    await nextFrame();
    await activate();
    activated = true;
    return true;
  } finally {
    // Keep the latch through the following paint so a retiring caller cannot
    // animate the disappearing control when its normal transition is restored.
    if (activated) await nextFrame();
    button.classList.remove('activation-pending');
    button.disabled = false;
  }
}
