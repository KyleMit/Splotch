// A browser never receives the Apple Pencil double-tap, as in the shipping web build.
export const subscribePencilDoubleTap: (listener: () => void) => () => void = () => () => {};
