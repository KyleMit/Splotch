import { error } from '@sveltejs/kit';
import {
  isPageShareCardPath,
  PAGE_SHARE_CARDS,
  SHARE_CARD_PATH_PARAM,
  SHARE_CARD_SIZE,
} from '$lib/components/page/socialCard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const path = url.searchParams.get(SHARE_CARD_PATH_PARAM);
  if (!isPageShareCardPath(path)) error(400, 'Unknown share-card path');
  return { card: { ...PAGE_SHARE_CARDS[path], ...SHARE_CARD_SIZE } };
};
