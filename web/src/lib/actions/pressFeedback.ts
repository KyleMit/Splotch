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
  try {
    // The state above is committed synchronously. One frame presents it; the
    // following callback can retire the control without waiting out its CSS.
    await nextFrame();
    await nextFrame();
    await activate();
    return true;
  } finally {
    button.classList.remove('activation-pending');
    button.disabled = false;
  }
}
