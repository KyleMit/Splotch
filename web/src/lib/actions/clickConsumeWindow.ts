// How long after a finished press or pinch its trailing synthesized click is
// consumed. The click is NOT dispatched synchronously after pointerup — on-device
// it arrived two tasks later (+2ms), which made a zero-delay timer clear too
// early and double-fire the control — and legacy WebKit could delay synthesis by
// its 350ms double-tap window, so the consume window must outlast both. Shared
// by the pointer-gesture actions that each swallow their own ghost click; it
// lives apart from scribbleGuard so a Settings action can import it without
// pulling in the drawing engine.
export const PRESS_CLICK_CONSUME_WINDOW_MS = 700;
