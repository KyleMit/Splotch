import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { html } from 'react-strict-dom';
import { NativeDialog } from './NativeDialog';
import { RsdAction, styles } from './controls';
import { BUNDLED_BOOKS, STARTER_BOOK_ID, type BookId } from '../drawing/bundledBooks';
import { BUNDLED_BOOK_ART, BUNDLED_BOOK_COVERS } from '../drawing/bundledBookAssets';
import { COLORING_PAGES, SAMPLE_PAGE_IDS, type PageId } from '../drawing/pages';
import { PAPER_THEMES } from '../drawing/theme';

const THUMBNAIL_WIDTH_PX = 132;
const PAGE_THUMBNAIL_ASPECT = 3 / 2;
type PickerView = { kind: 'books' } | { kind: 'pages'; bookId: BookId } | { kind: 'samples' };

export function RsdColoringBookPicker({
  selected,
  onChoose,
  onClose,
}: {
  selected: PageId;
  onChoose: (pageId: PageId) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<PickerView>({ kind: 'books' });
  const theme = useDrawingAppearance();
  const book = view.kind === 'pages' ? BUNDLED_BOOKS[view.bookId] : null;
  const label = book
    ? `${book.label} coloring pages`
    : view.kind === 'samples'
      ? 'Sample coloring pages'
      : 'Coloring books';
  function back() {
    setView({ kind: 'books' });
  }
  return (
    <NativeDialog
      visible
      label={label}
      onClose={view.kind === 'books' ? onClose : back}
      footer={<RsdAction label="Keep drawing" onClick={onClose} />}
    >
      <html.div style={styles.dialogContent}>
        <html.span>{label}</html.span>
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
            <RsdAction label="Blank paper" onClick={() => onChoose('blank')} />
            <RsdAction label="More pages" onClick={() => setView({ kind: 'samples' })} />
          </>
        ) : (
          <>
            <RsdAction label="Back to coloring books" onClick={back} />
            <html.div role="radiogroup" aria-label="Coloring page" style={styles.row}>
              {book
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
                        source={{ uri: BUNDLED_BOOK_ART[pageId][theme].selector }}
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
    </NativeDialog>
  );
}

const images = StyleSheet.create({
  cover: { width: THUMBNAIL_WIDTH_PX, height: THUMBNAIL_WIDTH_PX },
  page: { width: THUMBNAIL_WIDTH_PX, height: THUMBNAIL_WIDTH_PX / PAGE_THUMBNAIL_ASPECT },
});
