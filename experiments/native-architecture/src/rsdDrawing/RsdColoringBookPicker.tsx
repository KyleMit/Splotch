import { useRef, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { css, html } from 'react-strict-dom';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import {
  useHeldBooks,
  useLibraryControls,
  type LibraryContext,
} from '../offlineLibrary/LibraryScope';
import { OFFLINE_BOOKS } from '../offlineLibrary/books.generated';
import { offlinePageId } from '../offlineLibrary/identity';
import type { ArtOrientation } from '../drawing/paperSpace';
import type { PaperTheme } from '../drawing/theme';
import { BUNDLED_BOOKS, STARTER_BOOK_ID, isFarmPageId } from '../drawing/bundledBooks';
import { BUNDLED_FARM_COVERS, BUNDLED_FARM_SELECTORS } from '../drawing/bundledFarm/pickerImages';
import { COLORING_PAGES, pageLabel, type PageId } from '../drawing/pages';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { RsdColoringTile } from './RsdColoringTile';
import { ACTIVE_PAGE_NAME_HIDDEN_MAX_WIDTH_PX, RsdActivePageChip } from './RsdActivePageChip';
import { MODAL_GUTTER_MIN_PX, modalFrame } from './modalGeometry';
import {
  bookGridLayout,
  coloringTitleCompact,
  pageGridLayout,
  tileWidth,
  type GridLayout,
} from './coloringGrid';
import { armTapZone, insideTapZone, type TapPoint } from './tapZone';

const COLORING_PICKER_LABEL = 'Coloring books';
const BOOK_GRID_TITLE = 'Coloring Books';

type PickerPage = Readonly<{ pageId: PageId; label: string; image: string | undefined }>;
type PickerBook = Readonly<{
  id: string;
  label: string;
  cover: string | undefined;
  pages: readonly PickerPage[];
}>;

function starterBook(theme: PaperTheme, orientation: ArtOrientation): PickerBook {
  const book = BUNDLED_BOOKS[STARTER_BOOK_ID];
  return {
    id: STARTER_BOOK_ID,
    label: book.label,
    cover: BUNDLED_FARM_COVERS[theme],
    pages: book.pageIds.map((pageId) => ({
      pageId,
      label: COLORING_PAGES[pageId].label,
      image: BUNDLED_FARM_SELECTORS[pageId][orientation][theme],
    })),
  };
}

// The books this open shows: the starter book, then each downloaded book the picker holds, in
// catalog order rather than the order they finished downloading.
function usePickerBooks(theme: PaperTheme, orientation: ArtOrientation): readonly PickerBook[] {
  const library = useLibraryControls();
  const held = useHeldBooks(library);
  const dark = theme === 'dark';
  const downloaded = library
    ? OFFLINE_BOOKS.flatMap((book) => {
        const pack = held.find((entry) => entry.id === book.id);
        if (!pack || !installed(library, pack.revision)) return [];
        return [
          {
            id: pack.id,
            label: book.label,
            cover: library.owner.cover(pack, dark),
            pages: book.pages.map((page) => ({
              pageId: offlinePageId(pack, page.slug),
              label: page.label,
              image: library.owner.selector(pack, page.slug, orientation, dark),
            })),
          },
        ];
      })
    : [];
  return [starterBook(theme, orientation), ...downloaded];
}

function installed(library: LibraryContext, revision: string) {
  return library.state.installed.some((pack) => pack.revision === revision);
}

function activePagePreview(
  pageId: PageId,
  books: readonly PickerBook[],
  theme: PaperTheme,
  orientation: ArtOrientation
) {
  const page = books.flatMap((book) => book.pages).find((entry) => entry.pageId === pageId);
  if (page) return page.image;
  return isFarmPageId(pageId) ? BUNDLED_FARM_SELECTORS[pageId][orientation][theme] : undefined;
}

// The grid's own width, measured once laid out; until then the card's content width.
function useGridWidth() {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const frame = modalFrame('coloring', window, MODAL_GUTTER_MIN_PX);
  return {
    window,
    width: measured ?? frame.width - 2 * frame.body.inline,
    onLayout: (event: LayoutChangeEvent) => setMeasured(event.nativeEvent.layout.width),
  };
}

// The shipping Coloring Book Picker (ColoringBook.svelte): a modal card whose header carries the
// Active Page Chip, over the Book Grid, or over one book's Coloring Page Grid with Back in the
// header. With only the starter book it opens straight to that book's pages. The page art follows
// the paper's orientation, tall tiles on portrait paper.
export function RsdColoringBookPicker({
  selected,
  orientation,
  visible,
  onDismiss,
  onChoose,
  onClose,
}: {
  selected: PageId;
  orientation: ArtOrientation;
  visible: boolean;
  onDismiss: () => void;
  onChoose: (pageId: PageId) => void;
  onClose: () => void;
}) {
  const theme = useDrawingAppearance();
  const books = usePickerBooks(theme, orientation);
  const listsBooks = books.length >= 2;
  // An open that starts in the one book's pages stays there when the launch inventory lists
  // more books mid-open; Back then leads to them.
  const [activeBookId, setActiveBookId] = useState<string | null>(() =>
    listsBooks ? null : books[0].id
  );
  const active = books.find((book) => book.id === activeBookId) ?? (listsBooks ? null : books[0]);
  // A toddler mashes a cover several times before registering that anything happened; the first
  // tap swaps the grid, so the rest of the burst would pick whichever tile painted under the
  // finger. Each swap guards the spot it was tapped at (tapZone.ts), as shipping's swapView does.
  const swapZone = useRef<ReturnType<typeof armTapZone>>(null);
  const grid = useGridWidth();
  const guarded = (point: TapPoint | null) => insideTapZone(swapZone.current, point, Date.now());
  function swap(bookId: string | null, point: TapPoint | null) {
    swapZone.current = armTapZone(point, Date.now());
    setActiveBookId(bookId);
  }
  const chip =
    selected === 'blank' ? null : (
      <RsdActivePageChip
        name={pageLabel(selected)}
        preview={activePagePreview(selected, books, theme, orientation)}
        showName={grid.window.width > ACTIVE_PAGE_NAME_HIDDEN_MAX_WIDTH_PX}
        onClear={() => onChoose('blank')}
      />
    );
  const layout = active
    ? pageGridLayout(grid.window, orientation)
    : bookGridLayout(grid.window, books.length);
  const size = tileWidth(layout, grid.width);
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
      label={COLORING_PICKER_LABEL}
      size="coloring"
      touchBackdrop="plain"
      onClose={onClose}
      header={
        <DialogHeader
          title={active ? active.label : BOOK_GRID_TITLE}
          titleSize={coloringTitleCompact(grid.window) ? 'md' : 'xl'}
          onBack={active && listsBooks ? (point) => swap(null, point) : undefined}
          actions={chip}
          onClose={onClose}
        />
      }
    >
      <View onLayout={grid.onLayout}>
        <html.div style={[styles.grid(layout.gap), styles.width(gridWidth(layout, size))]}>
          {active
            ? active.pages.map((page) => (
                <RsdColoringTile
                  key={page.pageId}
                  shape={orientation}
                  image={page.image}
                  width={size}
                  accessibleName={`${page.label} coloring page`}
                  onPress={(point) => {
                    if (!guarded(point)) onChoose(page.pageId);
                  }}
                />
              ))
            : books.map((book) => (
                <RsdColoringTile
                  key={book.id}
                  shape="cover"
                  label={book.label}
                  theme={theme}
                  image={book.cover}
                  width={size}
                  accessibleName={`${book.label} coloring book`}
                  onPress={(point) => {
                    if (!guarded(point)) swap(book.id, point);
                  }}
                />
              ))}
        </html.div>
      </View>
    </ModalShell>
  );
}

function gridWidth(layout: GridLayout, tile: number) {
  return layout.columns * tile + (layout.columns - 1) * layout.gap;
}

const styles = css.create({
  grid: (gap: number) => ({
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    gap,
  }),
  width: (width: number) => ({ width }),
});
