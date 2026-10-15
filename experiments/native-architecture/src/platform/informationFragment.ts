import { currentAppFragment, visitAppFragment } from './appPath';

export function informationFragmentAtLaunch(): string | null {
  return currentAppFragment();
}
export function visitInformationFragment(id: string) {
  visitAppFragment(id);
}
