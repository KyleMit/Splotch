
// Generate optimized static assets to replace expensive real-time SVG filters

export function initOptimizedTextures() {
  const urlParams = new URLSearchParams(window.location.search);

  // Check for query parameters to disable effects for performance testing
  // Examples: ?noPaper=true
  if (!urlParams.has('noPaper')) {
    applyPaperTexture();
  }

  // Torn edge is now applied via CSS clip-path and drop-shadow
}

function applyPaperTexture() {
  const canvas = document.getElementById('drawingCanvas');
  
  // Create a minimal repeatable noise pattern SVG
  // This replaces the expensive per-pixel feTurbulence calculation on the main canvas
  const noiseSvg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
    <filter id='n'>
      <feTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/>
    </filter>
    <rect width='100' height='100' fill='transparent'/>
    <rect width='100' height='100' filter='url(#n)' opacity='0.05'/>
  </svg>`;

  const blob = new Blob([noiseSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // Set as background image on the canvas container or canvas itself
  // We use the canvas element but ensure it's handled as a background 
  // so it doesn't interfere with drawing operations (putImageData etc)
  // The CSS currently sets background-color: #fcfbf8;
  // We will layer the noise on top of that color using background-image
  
  canvas.style.backgroundImage = `url("${url}")`;
  // We remove the filter property to stop the GPU churn
  canvas.style.filter = 'none';
}

