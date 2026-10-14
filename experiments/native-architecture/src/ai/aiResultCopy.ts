import { AI_REPORT_RETENTION_DAYS, AI_REPORT_REVIEW_HOURS } from './reportContract';

// The words the shipping AI Result writes inline in its Svelte templates (AiErrorCard,
// AiResultError, AiResultDisclosure, AiImageResult, AiImageReport).
// native-ai-flow-copy.test.mjs reads each one back out of those templates.
export const AI_RESULT_COPY = {
  label: 'AI Result',
  closeWaiting: 'Keep drawing while this is made',
  keepDrawing: 'Keep drawing while you wait',
  download: 'Download',
  disclosure: 'AI-generated picture',
  reportPictureLabel: 'Report this picture',
  reportPicture: 'Report',
  reportProblem: 'Report a problem',
  safetySub: "That picture didn't work — try drawing something different!",
  grownUps: 'For grown-ups',
  reportRefusal: 'Report this refusal',
} as const;

export const AI_ERROR_CARD_COPY = {
  retry: {
    title: "Hmm, that didn't work",
    body: "Let's give it one more go.",
    action: 'Try again',
    note: null,
  },
  rest: {
    title: 'Still not working',
    body: "The picture-maker needs a little rest. Let's keep drawing!",
    action: 'Keep drawing',
    note: 'Try the wand again in a few minutes.',
  },
} as const;

const REPORT_PROMISE = `We look within ${AI_REPORT_REVIEW_HOURS} hours, and the report is deleted after ${AI_REPORT_RETENTION_DAYS} days.`;

export const AI_REPORT_CONFIRM_COPY = {
  picture: {
    title: 'Report this picture',
    copy: `The AI picture, drawing behind it, selected art style, and exact instruction sent to the AI go to a grown-up at Splotch. ${REPORT_PROMISE}`,
    drawing: 'The drawing behind it',
  },
  'false-positive-refusal': {
    title: 'Report this refusal',
    copy: `The rejected drawing, selected art style, exact instruction sent to the AI, and the AI's refusal reason go to a grown-up at Splotch. ${REPORT_PROMISE}`,
    drawing: 'The rejected drawing',
  },
} as const;

export const AI_REPORT_COPY = {
  output: 'The AI picture',
  cancel: 'Cancel',
  send: 'Send report',
  sending: 'Sending…',
  retry: 'Try again',
} as const;

export function aiReportReceived(reportId: string) {
  return `Thanks. We'll review it within ${AI_REPORT_REVIEW_HOURS} hours. Keep this report reference if you want it deleted sooner: ${reportId}`;
}
