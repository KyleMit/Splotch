export { FEEDBACK_APP_VERSION as APP_VERSION } from '../feedback/feedbackCopy';
import { AI_REPORT_HANDLING_NOTICE } from '../ai/reportContract';

export type InformationPage = 'help' | 'privacy' | 'whatsNew';

type InformationContent = {
  title: string;
  sections: readonly { title: string; paragraphs: readonly string[] }[];
};

export const INFORMATION_CONTENT: Record<InformationPage, InformationContent> = {
  help: {
    title: 'Help and about',
    sections: [
      {
        title: 'Make a picture',
        paragraphs: [
          'Pick a color and draw on the paper. Open Drawing tools to choose a brush or change its width. Undo takes back your last change.',
          'Choose Coloring pages in Drawing tools to start with an outline. You can turn coloring books and extra brushes on or off in Settings.',
        ],
      },
      {
        title: 'Keep your pictures',
        paragraphs: [
          'Save picture keeps an editable copy in this app. Find it again in Pictures. Export PNG makes an image you can download or share using your device.',
          'Save and clear keeps an editable copy, then starts a fresh picture. Undo can bring the cleared picture back. If an export fails, keep the app open and use the recovery notice to try again.',
        ],
      },
      {
        title: 'For grown-ups',
        paragraphs: [
          'Settings controls drawing sound and its level, appearance, coloring books and available brushes. Parent Center controls AI picture creation and grown-up checks.',
          'AI starts off. Sending feedback or an AI drawing follows the checks chosen in Parent Center. You can keep drawing without using either feature.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy',
    sections: [
      {
        title: 'Drawing stays on your device',
        paragraphs: [
          'Ordinary drawing and saving do not upload your pictures. Editable pictures and settings stay in this app on your device, or in this browser on the web. Clearing app or browser data can remove them, so export pictures you want to keep elsewhere.',
          'Splotch has no ads, accounts, public sharing feed or advertising trackers. It does not ask for a child’s name, email address or location.',
        ],
      },
      {
        title: 'AI pictures are optional',
        paragraphs: [
          'AI picture creation starts off. When you choose Send drawing for AI, a copy of the drawing and the chosen style go to Splotch’s hosted image service, which uses OpenAI. No drawing is sent just by opening the AI screen.',
          'Checking the free-picture allowance sends an installation code, without a drawing. The server uses it to count requests. An access code or your own OpenAI key is sent with requests that use it; credentials are stored separately from saved drawings.',
          'OpenAI processes submitted images under its data policies and may retain them for safety and legal obligations. Using your own key applies your account’s settings. Turning AI off stops new requests and keeps pictures and credentials already saved on your device.',
        ],
      },
      {
        title: 'Report an AI picture or refusal',
        paragraphs: [
          'Reporting is a separate choice after an AI picture or refusal. You review the original drawing and style before choosing Send report. A picture report includes the AI picture. A refusal report includes the authenticated refusal reason, without an AI picture. Both include the exact instruction used for that style and follow the image-report check chosen in Parent Center.',
          `Reports go privately to a grown-up at Splotch. ${AI_REPORT_HANDLING_NOTICE} Keep the report reference if you want to request earlier deletion. Opening a report or cancelling it sends nothing.`,
        ],
      },
      {
        title: 'Feedback is your choice',
        paragraphs: [
          'Feedback goes to Splotch’s private support tracker after you review it and confirm Send privately. Please leave names, email addresses and other personal details out of your message.',
          'Device details are optional. You can inspect them before sending. Sending feedback does not attach your drawing.',
        ],
      },
      {
        title: 'Coloring books and connections',
        paragraphs: [
          'The starter coloring book is bundled with the app. Other books download from Splotch when coloring books are enabled. Installed books work offline. These downloads do not include your drawing.',
          'Hosted requests carry ordinary connection details such as an IP address. The service uses rate limits to prevent abuse. To ask about privacy or request help, use Send Feedback in Drawing tools.',
        ],
      },
    ],
  },
  whatsNew: {
    title: 'What’s new',
    sections: [
      {
        title: 'In this beta',
        paragraphs: [
          'Draw with Pen, Crayon, Magic and Eraser, with separate drawing and eraser widths.',
          'Save editable pictures, reopen them from Pictures, save before clearing, and export PNG images.',
          'Browse coloring books and use installed pages offline.',
          'Choose light, dark or system appearance, Quiet, Medium or Loud drawing sound, and the brushes shown to your child.',
          'Manage grown-up checks and optional AI picture creation in Parent Center. Send private feedback from Drawing tools.',
        ],
      },
    ],
  },
};
