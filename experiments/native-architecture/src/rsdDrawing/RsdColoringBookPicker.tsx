import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { RsdLibraryControls } from '../offlineLibrary/RsdLibraryControls';
import { useLibraryControls } from '../offlineLibrary/LibraryScope';
import { OFFLINE_BOOKS } from '../offlineLibrary/books.generated';
import { offlinePageId } from '../offlineLibrary/identity';
import type { Pack, OfflinePageSlug } from '../offlineLibrary/manifest';
import type { PaperTheme } from '../drawing/theme';
import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { html } from 'react-strict-dom';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { RsdAction, styles } from './controls';
import { BUNDLED_BOOKS, STARTER_BOOK_ID, type BookId } from '../drawing/bundledBooks';
import { BUNDLED_BOOK_ART, BUNDLED_BOOK_COVERS } from '../drawing/bundledBookAssets';
import { COLORING_PAGES, SAMPLE_PAGE_IDS, type PageId } from '../drawing/pages';
import { PAPER_THEMES } from '../drawing/theme';

const THUMBNAIL_WIDTH_PX = 132;
const PAGE_THUMBNAIL_ASPECT = 3 / 2;
type PickerView =
  | { kind: 'books' }
  | { kind: 'pages'; bookId: BookId }
  | { kind: 'samples' }
  | { kind: 'offline'; pack: Pack };

function pickerLabel(view: PickerView, bookLabel: string | undefined) {
  if (bookLabel) return `${bookLabel} coloring pages`;
  return view.kind === 'samples' ? 'Sample coloring pages' : 'Coloring books';
}

export function RsdColoringBookPicker({
  selected,
  visible,
  onDismiss,
  onChoose,
  onClose,
}: {
  selected: PageId;
  visible: boolean;
  onDismiss: () => void;
  onChoose: (pageId: PageId) => void;
  onClose: () => void;
}) {
  const library = useLibraryControls();
  const [heldBooks] = useState(() => library?.state.installed ?? []);
  const [view, setView] = useState<PickerView>({ kind: 'books' });
  const theme = useDrawingAppearance();
  const book = view.kind === 'pages' ? BUNDLED_BOOKS[view.bookId] : null;
  const offlineBook =
    view.kind === 'offline' ? OFFLINE_BOOKS.find((book) => book.id === view.pack.id) : null;
  const label = pickerLabel(view, (offlineBook ?? book)?.label);
  function back() {
    setView({ kind: 'books' });
  }
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
      label={label}
      size="sheet"
      onClose={view.kind === 'books' ? onClose : back}
      header={
        <DialogHeader
          title={label}
          titleSize="xl"
          onBack={view.kind === 'books' ? undefined : back}
          onClose={onClose}
        />
      }
    >
      <html.div style={styles.dialogContent}>
        <html.span>Your drawing stays. Undo brings the last page back.</html.span>
        {view.kind === 'books' ? (
          <>
            <html.button
              aria-label="Farm coloring book"
              style={[styles.action, styles.touchTarget(THUMBNAIL_WIDTH_PX)]}
              onClick={() => setView({ kind: 'pages', bookId: STARTER_BOOK_ID })}
            >
              <Image
                source={{ uri: BUNDLED_BOOK_COVERS[theme] }}
                style={images.cover}
                accessible={false}
              />
              <html.span>{BUNDLED_BOOKS[STARTER_BOOK_ID].label}</html.span>
            </html.button>
            {heldBooks
              .filter((pack) =>
                library?.state.installed.some((current) => current.revision === pack.revision)
              )
              .map((pack) => (
                <OfflineColoringBook
                  key={pack.revision}
                  pack={pack}
                  theme={theme}
                  onOpen={() => setView({ kind: 'offline', pack })}
                />
              ))}
            <RsdLibraryControls />
            <RsdAction label="Blank paper" onClick={() => onChoose('blank')} />
            <RsdAction label="More pages" onClick={() => setView({ kind: 'samples' })} />
          </>
        ) : (
          <>
            <html.div role="radiogroup" aria-label="Coloring page" style={styles.row}>
              {view.kind === 'offline' && offlineBook
                ? offlineBook.pages.map((page) => (
                    <OfflineColoringPage
                      key={page.slug}
                      pack={view.pack}
                      page={page}
                      selected={selected}
                      theme={theme}
                      onChoose={onChoose}
                    />
                  ))
                : book
                  ? book.pageIds.map((pageId) => (
                      <html.button
                        key={pageId}
                        role="radio"
                        aria-label={COLORING_PAGES[pageId].label}
                        aria-checked={selected === pageId}
                        style={[
                          styles.action,
                          styles.touchTarget(THUMBNAIL_WIDTH_PX),
                          selected === pageId && styles.selected,
                        ]}
                        onClick={() => onChoose(pageId)}
                      >
                        <Image
                          source={{ uri: BUNDLED_BOOK_ART[pageId].selector[theme] }}
                          style={[images.page, { backgroundColor: PAPER_THEMES[theme].paper }]}
                          accessible={false}
                        />
                        <html.span>{COLORING_PAGES[pageId].label}</html.span>
                      </html.button>
                    ))
                  : SAMPLE_PAGE_IDS.map((pageId) => (
                      <RsdAction
                        key={pageId}
                        label={COLORING_PAGES[pageId].label}
                        selection="radio"
                        selected={selected === pageId}
                        onClick={() => onChoose(pageId)}
                      />
                    ))}
            </html.div>
          </>
        )}
      </html.div>
    </ModalShell>
  );
}

function OfflineColoringBook({
  pack,
  theme,
  onOpen,
}: {
  pack: Pack;
  theme: PaperTheme;
  onOpen: () => void;
}) {
  const library = useLibraryControls();
  const book = OFFLINE_BOOKS.find((book) => book.id === pack.id);
  return (
    <html.button
      aria-label={`${book?.label} coloring book`}
      style={[styles.action, styles.touchTarget(THUMBNAIL_WIDTH_PX)]}
      onClick={onOpen}
    >
      <Image
        source={{ uri: library?.owner.cover(pack, theme === 'dark') }}
        style={images.cover}
        accessible={false}
      />
      <html.span>{book?.label}</html.span>
    </html.button>
  );
}

function OfflineColoringPage({
  pack,
  page,
  selected,
  theme,
  onChoose,
}: {
  pack: Pack;
  page: { slug: OfflinePageSlug; label: string };
  selected: PageId;
  theme: PaperTheme;
  onChoose: (pageId: PageId) => void;
}) {
  const library = useLibraryControls();
  const pageId = offlinePageId(pack, page.slug);
  return (
    <html.button
      key={pageId}
      role="radio"
      aria-label={page.label}
      aria-checked={selected === pageId}
      style={[
        styles.action,
        styles.touchTarget(THUMBNAIL_WIDTH_PX),
        selected === pageId && styles.selected,
      ]}
      onClick={() => onChoose(pageId)}
    >
      <Image
        source={{ uri: library?.owner.selector(pack, page.slug, theme === 'dark') }}
        style={images.page}
        accessible={false}
      />
      <html.span>{page.label}</html.span>
    </html.button>
  );
}

const images = StyleSheet.create({
  cover: { width: THUMBNAIL_WIDTH_PX, height: THUMBNAIL_WIDTH_PX },
  page: { width: THUMBNAIL_WIDTH_PX, height: THUMBNAIL_WIDTH_PX / PAGE_THUMBNAIL_ASPECT },
});
