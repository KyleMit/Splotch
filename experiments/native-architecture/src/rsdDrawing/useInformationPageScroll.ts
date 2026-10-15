import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, type ScrollView } from 'react-native';
import type { AppPage } from '../information/appPages';
import type { SectionId } from '../../../../web/src/routes/privacy/contents';
import { privacySectionAtLaunch } from '../platform/privacySectionLink';
import { PRIVACY_LAYOUT } from '../information/privacyLayout';
import { PAGE_FRAMED_MAX_WIDTH_PX } from './RsdNotFoundPage';

export function useInformationPageScroll(page: Exclude<AppPage, 'drawing'>) {
  const scroll = useRef<ScrollView>(null);
  const bodyOffset = useRef<number | null>(null);
  const sections = useRef<Record<string, number>>({});
  const pending = useRef<SectionId | null>(null);
  const [offset, setOffset] = useState(0);
  const width = useWindowDimensions().width;
  const park =
    width > PAGE_FRAMED_MAX_WIDTH_PX ? PRIVACY_LAYOUT.stickyTop : PRIVACY_LAYOUT.compactPark;
  const jump = useCallback(
    (id: string) => {
      scroll.current?.scrollTo({
        y: Math.max(0, (bodyOffset.current ?? 0) + (sections.current[id] ?? 0) - park),
        animated: false,
      });
    },
    [park]
  );
  const resumeDeepLink = useCallback(() => {
    if (
      pending.current &&
      bodyOffset.current !== null &&
      sections.current[pending.current] !== undefined
    ) {
      jump(pending.current);
      pending.current = null;
    }
  }, [jump]);
  useEffect(() => {
    pending.current = page === 'privacy' ? privacySectionAtLaunch() : null;
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
