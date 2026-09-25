import { AI_ESTIMATE_MS } from './dialProgress';

const MS_PER_SECOND = 1000;

// Written from the dial's own estimate rather than beside it: a caption
// promising one duration over a dial paced for another is the drift this
// derivation makes impossible.
const AI_ESTIMATE_SECONDS = Math.round(AI_ESTIMATE_MS / MS_PER_SECOND);

export const AI_LOADING_TITLE = 'Making your picture…';
export const AI_LOADING_SUBTITLE = `This takes about ${AI_ESTIMATE_SECONDS} seconds`;

// What the AI Result's visually hidden status says once the dial gives way;
// while it turns, the status reads AI_LOADING_TITLE.
export const AI_READY_ANNOUNCEMENT = 'Your picture is ready';
export const AI_FAILED_ANNOUNCEMENT = "That didn't work";
