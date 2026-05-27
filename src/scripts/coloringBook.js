// Coloring book picker: parental-control toggle, book/page catalog,
// modal dialog with two views (books → pages in book), and the
// canvas overlay that renders the selected page behind drawn strokes.

const CONTROL_ENABLED_KEY = 'splotch-coloring-book-enabled';

// Static catalog. Each entry is one book; pages[] must always be 6
// so the grid lays out cleanly as 2×3 / 3×2.
const BOOKS = [
  {
    id: 'frozen',
    name: 'Frozen',
    cover: '/coloring/frozen/frozen.png',
    pages: [
      '/coloring/frozen/anna.png',
      '/coloring/frozen/elsa.png',
      '/coloring/frozen/kristoph.png',
      '/coloring/frozen/olaf.png',
      '/coloring/frozen/pabbie.png',
      '/coloring/frozen/sven.png'
    ]
  },
  {
    id: 'animals',
    name: 'Animals',
    cover: '/coloring/animals/animals.png',
    pages: [
      '/coloring/animals/cat.png',
      '/coloring/animals/cow.png',
      '/coloring/animals/dog.png',
      '/coloring/animals/duck.png',
      '/coloring/animals/horse.png',
      '/coloring/animals/pig.png'
    ]
  }
];

let controlEnabled = localStorage.getItem(CONTROL_ENABLED_KEY) === 'true';

let dialog;
let booksView;
let pagesView;
let booksGrid;
let pagesGrid;
let pagesTitle;
let backButton;
let clearOverlayButton;
let overlayImg;
let triggerButton;

export function isColoringBookEnabled() {
  return controlEnabled;
}

export function setColoringBookEnabled(enabled) {
  controlEnabled = enabled;
  localStorage.setItem(CONTROL_ENABLED_KEY, enabled.toString());
}

function showBooksView() {
  booksView.hidden = false;
  pagesView.hidden = true;
  clearOverlayButton.hidden = !overlayImg || overlayImg.hidden;
}

function showPagesView(book) {
  booksView.hidden = true;
  pagesView.hidden = false;
  pagesTitle.textContent = book.name;

  pagesGrid.innerHTML = '';
  book.pages.forEach(src => {
    const btn = document.createElement('button');
    btn.className = 'coloring-tile';
    btn.type = 'button';
    btn.setAttribute('aria-label', `${book.name} coloring page`);

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    btn.appendChild(img);

    btn.addEventListener('click', () => {
      setOverlay(src);
      closeColoringBook();
    });
    pagesGrid.appendChild(btn);
  });
}

function renderBooksGrid() {
  booksGrid.innerHTML = '';
  BOOKS.forEach(book => {
    const btn = document.createElement('button');
    btn.className = 'coloring-tile coloring-book-tile';
    btn.type = 'button';
    btn.setAttribute('aria-label', `${book.name} coloring book`);

    const img = document.createElement('img');
    img.src = book.cover;
    img.alt = '';
    btn.appendChild(img);

    const label = document.createElement('span');
    label.className = 'coloring-book-label';
    label.textContent = book.name;
    btn.appendChild(label);

    btn.addEventListener('click', () => showPagesView(book));
    booksGrid.appendChild(btn);
  });
}

function setOverlay(src) {
  if (!overlayImg) return;
  overlayImg.src = src;
  overlayImg.hidden = false;
  document.body.classList.add('has-coloring-overlay');
}

export function clearOverlay() {
  if (!overlayImg) return;
  overlayImg.hidden = true;
  overlayImg.removeAttribute('src');
  document.body.classList.remove('has-coloring-overlay');
}

export function getActiveOverlayImage() {
  if (!overlayImg || overlayImg.hidden || !overlayImg.naturalWidth) return null;
  return overlayImg;
}

export function openColoringBook() {
  if (!dialog || dialog.open) return;

  // Anchor the open animation to the trigger button so the dialog
  // appears to fly out from it, matching the color picker / parent center.
  if (triggerButton) {
    const rect = triggerButton.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    dialog.style.setProperty('--origin-x', `${cx - window.innerWidth / 2}px`);
    dialog.style.setProperty('--origin-y', `${cy - window.innerHeight / 2}px`);
  }

  renderBooksGrid();
  showBooksView();
  dialog.showModal();
}

export function closeColoringBook() {
  if (!dialog) return;
  if (dialog.open) dialog.close();
}

function isPointInsideDialog(d, x, y) {
  const rect = d.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function initColoringBook() {
  dialog = document.getElementById('coloring-book-dialog');
  booksView = document.getElementById('coloringBooksView');
  pagesView = document.getElementById('coloringPagesView');
  booksGrid = document.getElementById('coloringBooksGrid');
  pagesGrid = document.getElementById('coloringPagesGrid');
  pagesTitle = document.getElementById('coloringPagesTitle');
  backButton = document.getElementById('coloringBackButton');
  clearOverlayButton = document.getElementById('coloringClearOverlay');
  overlayImg = document.getElementById('coloringOverlay');
  triggerButton = document.getElementById('coloringBookButton');

  if (!dialog || !triggerButton) return;

  const closeBtn = dialog.querySelector('.coloring-book-close');
  closeBtn?.addEventListener('click', () => closeColoringBook());

  backButton?.addEventListener('click', () => showBooksView());

  clearOverlayButton?.addEventListener('click', () => {
    clearOverlay();
    closeColoringBook();
  });

  // Trigger button opens the dialog.
  triggerButton.addEventListener('click', () => openColoringBook());

  // Click on backdrop (outside the dialog box) closes without selecting.
  dialog.addEventListener('pointerdown', (e) => {
    if (!isPointInsideDialog(dialog, e.clientX, e.clientY)) {
      closeColoringBook();
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

export function setColoringBookButtonVisible(visible) {
  if (!triggerButton) return;
  triggerButton.hidden = !visible;
}
