
// Generate optimized static assets to replace expensive real-time SVG filters

export function initOptimizedTextures() {
  const urlParams = new URLSearchParams(window.location.search);

  // Check for query parameters to disable effects for performance testing
  // Examples: ?noPaper=true or ?noEdge=true
  if (!urlParams.has('noPaper')) {
    applyPaperTexture();
  }

  if (!urlParams.has('noEdge')) {
    applyTornEdgeTexture();
  }
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

function applyTornEdgeTexture() {
  const clearLine = document.querySelector('.clear-line');
  if (!clearLine) return;

  // The gradient currently defined in CSS for .clear-line
  // background: linear-gradient(180deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.04) 40%, rgba(0, 0, 0, 0.01) 70%, transparent 100%);
  
  // We encapsulate the Gradient AND the Filter into a single static SVG image
  // This allows the browser to rasterize it once and treat it as a simple texture during the drag animation
  
  const width = window.innerWidth;
  const height = 60; // Slightly larger than the 30px height to accommodate displacement

  const tornEdgeSvg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' preserveAspectRatio="none">
    <defs>
      <filter id="torn-edge" x="-50%" y="-50%" width="200%" height="200%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed="3" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="35" xChannelSelector="R" yChannelSelector="G" result="torn"/>
        <feGaussianBlur in="torn" stdDeviation="3" result="blur"/>
        <feOffset in="blur" dx="0" dy="4" result="shadow"/>
        <feFlood flood-color="rgba(0,0,0,0.2)" result="color"/>
        <feComposite in="color" in2="shadow" operator="in" result="coloredShadow"/>
        <feMerge>
          <feMergeNode in="coloredShadow"/>
          <feMergeNode in="torn"/>
        </feMerge>
      </filter>
      <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.08)" />
        <stop offset="40%" style="stop-color:rgba(0,0,0,0.04)" />
        <stop offset="70%" style="stop-color:rgba(0,0,0,0.01)" />
        <stop offset="100%" style="stop-color:rgba(0,0,0,0)" />
      </linearGradient>
    </defs>
    <rect x="-20" y="0" width="${width + 40}" height="30" fill="url(#grad)" filter="url(#torn-edge)" transform="translate(0, 15)"/>
  </svg>`;

  const blob = new Blob([tornEdgeSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  clearLine.style.backgroundImage = `url("${url}")`;
  clearLine.style.backgroundRepeat = 'no-repeat';
  clearLine.style.backgroundSize = '100% 100%';
  
  // Important: Remove the CSS filter and gradient since they are now baked into the image
  clearLine.style.filter = 'none';
  clearLine.style.backgroundColor = 'transparent'; // Only use the image
  
  // Update on resize to ensure texture stays sharp and fills width
  window.addEventListener('resize', debounce(() => {
    URL.revokeObjectURL(url);
    applyTornEdgeTexture();
  }, 250));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
