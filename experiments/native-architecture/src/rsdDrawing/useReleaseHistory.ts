import { useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { RELEASES_SHOWN_OPEN } from '../../../../web/src/lib/releaseHistoryPolicy';

type ReleasePosition = { id: string };
export function useReleaseHistory(
  items: readonly ReleasePosition[],
  onSectionLayout: (id: string, y: number) => void,
  onLink: (href: string) => void
) {
  const [olderOpen, setOlderOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [geometry, setGeometry] = useState({
    top: 0,
    height: 0,
    railHeight: 0,
    columnTop: 0,
    contentsTop: 0,
    contentsHeight: 0,
  });
  const positions = useRef<Record<string, number>>({});
  const offsets = useRef({ root: 0, body: 0, column: 0 });
  const pending = useRef<string | null>(null);
  const base = () => offsets.current.root + offsets.current.body + offsets.current.column;
  const resumeJump = () => {
    if (!contentsOpen && pending.current && positions.current[pending.current] !== undefined) {
      onLink(`#${pending.current}`);
      pending.current = null;
    }
  };
  const publishPositions = () => {
    setGeometry((old) => ({ ...old, columnTop: base() }));
    for (const [id, y] of Object.entries(positions.current)) onSectionLayout(id, base() + y);
    resumeJump();
  };
  return {
    geometry,
    positions: positions.current,
    olderOpen,
    contentsOpen,
    toggleContents: () => setContentsOpen((value) => !value),
    showOlder: () => setOlderOpen(true),
    pick(id: string) {
      pending.current = id;
      if (items.findIndex((release) => release.id === id) >= RELEASES_SHOWN_OPEN && !olderOpen)
        setOlderOpen(true);
      else if (!contentsOpen) resumeJump();
      setContentsOpen(false);
    },
    rootLayout({ nativeEvent }: LayoutChangeEvent) {
      offsets.current.root = nativeEvent.layout.y;
      setGeometry((old) => ({
        ...old,
        top: nativeEvent.layout.y,
        height: nativeEvent.layout.height,
      }));
      publishPositions();
    },
    bodyLayout({ nativeEvent }: LayoutChangeEvent) {
      offsets.current.body = nativeEvent.layout.y;
      publishPositions();
    },
    columnLayout({ nativeEvent }: LayoutChangeEvent) {
      offsets.current.column = nativeEvent.layout.y;
      publishPositions();
    },
    contentsLayout({ nativeEvent }: LayoutChangeEvent) {
      setGeometry((old) => ({
        ...old,
        contentsTop: offsets.current.root + nativeEvent.layout.y,
        contentsHeight: nativeEvent.layout.height,
      }));
    },
    railLayout({ nativeEvent }: LayoutChangeEvent) {
      setGeometry((old) => ({ ...old, railHeight: nativeEvent.layout.height }));
    },
    articleLayout(id: string, { nativeEvent }: LayoutChangeEvent) {
      positions.current[id] = nativeEvent.layout.y;
      onSectionLayout(id, base() + nativeEvent.layout.y);
      resumeJump();
    },
  };
}
