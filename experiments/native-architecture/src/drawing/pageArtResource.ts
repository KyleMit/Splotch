import { PageArtMotion } from './PageArtMotion';
import { prepareColoringPage } from './pageArtSelection';

const content = { PageArtMotion, prepareColoringPage };
const resource = { current: () => content, load: async () => content };
export function pageArt() {
  return resource;
}
