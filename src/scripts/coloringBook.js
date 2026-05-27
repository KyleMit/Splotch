// Coloring book picker: parental-control toggle, folder/image catalog,
// modal dialog with two views (folders → images in folder), and the
// canvas overlay that renders the selected image behind drawn strokes.

const CONTROL_ENABLED_KEY = 'splotch-coloring-book-enabled';

// Static catalog. Each entry is one folder; images[] must always be 6
// so the grid lays out cleanly as 2×3 / 3×2.
const FOLDERS = [
  {
    id: 'frozen',
    name: 'Frozen',
    cover: '/coloring/frozen/frozen.png',
    images: [
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
    images: [
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
let folderView;
let imagesView;
let folderGrid;
let imagesGrid;
let imagesTitle;
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

function showFolderView() {
  folderView.hidden = false;
  imagesView.hidden = true;
  clearOverlayButton.hidden = !overlayImg || overlayImg.hidden;
}

function showImagesView(folder) {
  folderView.hidden = true;
  imagesView.hidden = false;
  imagesTitle.textContent = folder.name;

  imagesGrid.innerHTML = '';
  folder.images.forEach(src => {
    const btn = document.createElement('button');
    btn.className = 'coloring-tile';
    btn.type = 'button';
    btn.setAttribute('aria-label', folder.name);

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    btn.appendChild(img);

    btn.addEventListener('click', () => {
      setOverlay(src);
      closeColoringBook();
    });
    imagesGrid.appendChild(btn);
  });
}

function renderFolderGrid() {
  folderGrid.innerHTML = '';
  FOLDERS.forEach(folder => {
    const btn = document.createElement('button');
    btn.className = 'coloring-tile coloring-folder-tile';
    btn.type = 'button';
    btn.setAttribute('aria-label', folder.name);

    const img = document.createElement('img');
    img.src = folder.cover;
    img.alt = '';
    btn.appendChild(img);

    const label = document.createElement('span');
    label.className = 'coloring-folder-label';
    label.textContent = folder.name;
    btn.appendChild(label);

    btn.addEventListener('click', () => showImagesView(folder));
    folderGrid.appendChild(btn);
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

  renderFolderGrid();
  showFolderView();
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
  folderView = document.getElementById('coloringFolderView');
  imagesView = document.getElementById('coloringImagesView');
  folderGrid = document.getElementById('coloringFolderGrid');
  imagesGrid = document.getElementById('coloringImagesGrid');
  imagesTitle = document.getElementById('coloringImagesTitle');
  backButton = document.getElementById('coloringBackButton');
  clearOverlayButton = document.getElementById('coloringClearOverlay');
  overlayImg = document.getElementById('coloringOverlay');
  triggerButton = document.getElementById('coloringBookButton');

  if (!dialog || !triggerButton) return;

  const closeBtn = dialog.querySelector('.coloring-book-close');
  closeBtn?.addEventListener('click', () => closeColoringBook());

  backButton?.addEventListener('click', () => showFolderView());

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
