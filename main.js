import { Howl } from 'howler';

// Canvas setup
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: false });

// Set canvas size to fill container
function resizeCanvas() {
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();

  // Store current drawing if canvas has content
  const imageData = canvas.width > 0 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

  canvas.width = rect.width;
  canvas.height = rect.height;

  // Restore drawing if it existed
  if (imageData) {
    ctx.putImageData(imageData, 0, 0);
  }

  // Set drawing properties
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Drawing state
let isDrawing = false;
let currentColor = '#FF6B6B';
let lastX = 0;
let lastY = 0;

// Sound setup
let soundEnabled = true;
const pencilSounds = new Howl({
  src: ['/sounds/pencil.mp3'],
  sprite: {
    draw1: [0, 100],
    draw2: [100, 100],
    draw3: [200, 100]
  },
  volume: 0.3
});

let lastSoundTime = 0;
const soundThrottle = 50; // Play sound at most every 50ms

function playDrawSound() {
  if (!soundEnabled) return;

  const now = Date.now();
  if (now - lastSoundTime < soundThrottle) return;

  lastSoundTime = now;
  const randomSound = `draw${Math.floor(Math.random() * 3) + 1}`;
  pencilSounds.play(randomSound);
}

// Color picker
const colorButtons = document.querySelectorAll('.color-btn');
colorButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    colorButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
  });
});

// Drawing functions
function startDrawing(e) {
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;

  ctx.strokeStyle = currentColor;
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);

  playDrawSound();
}

function draw(e) {
  if (!isDrawing) return;

  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  ctx.lineTo(x, y);
  ctx.stroke();

  lastX = x;
  lastY = y;

  playDrawSound();
}

function stopDrawing() {
  isDrawing = false;
  ctx.beginPath();
}

// Pointer events for drawing
canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointerout', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

// Trash slider
const trashSlider = document.getElementById('trashSlider');
let isDragging = false;
let startY = 0;
let currentY = 0;
const clearThreshold = 150; // pixels to drag before clearing

function startDrag(e) {
  isDragging = true;
  startY = e.clientY || e.touches[0].clientY;
  currentY = startY;
  trashSlider.classList.add('dragging');
  e.preventDefault();
}

function drag(e) {
  if (!isDragging) return;

  const clientY = e.clientY || e.touches[0].clientY;
  currentY = clientY;
  const distance = Math.abs(currentY - startY);

  // Visual feedback
  const progress = Math.min(distance / clearThreshold, 1);
  trashSlider.style.opacity = 1 - (progress * 0.3);

  if (distance > clearThreshold) {
    clearCanvas();
    stopDrag();
  }

  e.preventDefault();
}

function stopDrag() {
  isDragging = false;
  trashSlider.classList.remove('dragging');
  trashSlider.style.opacity = 1;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Play a satisfying clear sound (if you add one)
  if (soundEnabled && pencilSounds.playing()) {
    pencilSounds.stop();
  }
}

trashSlider.addEventListener('pointerdown', startDrag);
trashSlider.addEventListener('pointermove', drag);
trashSlider.addEventListener('pointerup', stopDrag);
trashSlider.addEventListener('pointercancel', stopDrag);

// Sound toggle
const soundToggle = document.getElementById('soundToggle');
const soundOn = soundToggle.querySelector('.sound-on');
const soundOff = soundToggle.querySelector('.sound-off');

soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;

  if (soundEnabled) {
    soundOn.style.display = 'inline';
    soundOff.style.display = 'none';
  } else {
    soundOn.style.display = 'none';
    soundOff.style.display = 'inline';
  }
});

// Prevent context menu on long press
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Request wake lock to prevent screen sleep
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake lock activated');
    }
  } catch (err) {
    console.log('Wake lock error:', err);
  }
}

// Request wake lock on first user interaction
document.addEventListener('pointerdown', requestWakeLock, { once: true });

// Re-request wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});
