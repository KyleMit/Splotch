import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type ScrollViewInstance } from 'react-native';
import { useWindowDimensions } from '../platform/windowDimensions';
import { INFORMATION_TOP_ID, type AppPage } from '../information/appPages';
import releases from '../lib/releases.json';
import { informationFragmentAtLaunch } from '../platform/informationFragment';
import { privacySectionAtLaunch } from '../platform/privacySectionLink';
import { PRIVACY_LAYOUT } from '../information/privacyLayout';
import { PAGE_FRAMED_MAX_WIDTH_PX } from './RsdNotFoundPage';
import { useInformationViewport } from './useInformationViewport';

export function useInformationPageScroll(page: Exclude<AppPage, 'drawing'>) {
  const scroll = useRef<ScrollViewInstance>(null);
  const bodyOffset = useRef<number | null>(null);
  const sections = useRef<Record<string, number>>({});
  const pending = useRef<string | null>(null);
  const [offset, setOffset] = useState(0);
  const width = useWindowDimensions().width;
  const { top } = useInformationViewport();
  const park =
    top +
    (width > PAGE_FRAMED_MAX_WIDTH_PX ? PRIVACY_LAYOUT.stickyTop : PRIVACY_LAYOUT.compactPark);
  const jump = useCallback(
    (id: string) => {
      scroll.current?.scrollTo({
        y:
          id === INFORMATION_TOP_ID
            ? 0
            : Math.max(0, (bodyOffset.current ?? 0) + (sections.current[id] ?? 0) - park),
        animated: false,
      });
    },
    [park]
  );
  const currentJump = useRef(jump);
  useLayoutEffect(() => {
    currentJump.current = jump;
  }, [jump]);
  const resumeDeepLink = useCallback(() => {
    if (
      pending.current &&
      bodyOffset.current !== null &&
      sections.current[pending.current] !== undefined
    ) {
      currentJump.current(pending.current);
      pending.current = null;
    }
  }, []);
  useEffect(() => {
    const fragment = informationFragmentAtLaunch();
    pending.current =
      page === 'privacy'
        ? privacySectionAtLaunch()
        : page === 'changelog' && releases.some(({ id }) => id === fragment)
          ? fragment
          : null;
    resumeDeepLink();
  }, [page, resumeDeepLink]);
  return {
    scroll,
    offset: offset - (bodyOffset.current ?? 0),
    onScroll: setOffset,
    onBodyOffset(y: number) {
      bodyOffset.current = y;
      resumeDeepLink();
    },
    onSectionLayout(id: string, y: number) {
      sections.current[id] = y;
      resumeDeepLink();
    },
    jump,
  };
}
