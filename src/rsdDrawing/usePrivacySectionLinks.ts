import { useEffect, useRef, useState } from 'react';
import type { SectionId } from '../lib/privacy/contents';
import {
  COPIED_DURATION_MS,
  REANNOUNCE_DELAY_MS,
  sectionLinkAnnouncement,
} from '../lib/privacy/sectionLink';
import { copyPrivacySection, replacePrivacyFragment } from '../platform/privacySectionLink';

export function usePrivacySectionLinks(onLink: (href: string) => void) {
  const [copied, setCopied] = useState<SectionId | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const request = useRef(0);
  const notice = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeat = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      request.current += 1;
      clearTimeout(notice.current);
      clearTimeout(repeat.current);
    },
    []
  );
  async function copy(id: SectionId) {
    const current = ++request.current;
    const success = await copyPrivacySection(id);
    if (current !== request.current) return;
    if (!success) {
      onLink(`#${id}`);
      return;
    }
    replacePrivacyFragment(id);
    setCopied(id);
    const message = sectionLinkAnnouncement(id);
    clearTimeout(notice.current);
    clearTimeout(repeat.current);
    if (message === announcement) {
      setAnnouncement('');
      repeat.current = setTimeout(() => setAnnouncement(message), REANNOUNCE_DELAY_MS);
    } else setAnnouncement(message);
    notice.current = setTimeout(() => {
      setCopied(null);
      setAnnouncement('');
    }, COPIED_DURATION_MS);
  }
  return { copied, announcement, copy };
}
