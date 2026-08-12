// The loading dial's diameter as a fraction of the stage it sits on, and the
// size it stops growing at. The fraction keeps it proportionate on a phone; the
// cap keeps it from becoming a dinner plate once the stage takes a desktop's
// worth of room. AiConfetti's mask hole is cut from these same two numbers (see
// AiImageResult), because a hole that outgrew the dial would leave a bare circle
// in the falling leaves with nothing behind it.
export const DIAL_STAGE_FRACTION = 0.52;
export const DIAL_MAX_SIZE_PX = 300;
