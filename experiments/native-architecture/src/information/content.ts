export { FEEDBACK_APP_VERSION as APP_VERSION } from '../feedback/feedbackCopy';
import privacy from './privacy.generated.json';
import { RELEASE_NOTES } from '../settings/whatsNew';

const [CURRENT_RELEASE] = RELEASE_NOTES;

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
          'Pick a color and draw on the paper. Open the tool drawer to choose a brush or change its width. Undo takes back your last change.',
          'Choose Coloring books in the tool drawer to start with an outline. You can turn coloring books and extra brushes on or off in Settings.',
        ],
      },
      {
        title: 'Keep your pictures',
        paragraphs: [
          'The camera in the tool drawer saves your picture to Photos on a phone or tablet, or downloads it in a browser.',
          'Clear starts a fresh picture, and Undo can bring the cleared picture back. Turn on Auto-Save on Delete in Settings to save each picture before it clears.',
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
    title: privacy.native.title,
    sections: privacy.native.sections.map((section) => ({
      title: section.title,
      paragraphs: section.blocks.map(({ spans }) => spans.map(({ text }) => text).join('')),
    })),
  },
  // The shipping What's New notes for the current release, from the same release documents.
  whatsNew: {
    title: 'What’s new',
    sections: CURRENT_RELEASE.sections.map(({ title, blocks }) => ({
      title,
      paragraphs: blocks.map(({ text }) => text),
    })),
  },
};
