// The loading dial's friendly violet → blue → teal → green sweep as it fills.
// Shared by the web dial (AiDial.svelte) and the native one, which imports it
// across the experiments/native-architecture boundary.
const HUE_START_DEG = 282;
const HUE_SWEEP_DEG = 132;
const HUE_SECOND_STOP_OFFSET_DEG = 46;

export function dialColors(progress: number): { start: string; end: string } {
  const hue = HUE_START_DEG - HUE_SWEEP_DEG * progress;
  return {
    start: `hsl(${hue}, 82%, 62%)`,
    end: `hsl(${hue + HUE_SECOND_STOP_OFFSET_DEG}, 88%, 67%)`,
  };
}
