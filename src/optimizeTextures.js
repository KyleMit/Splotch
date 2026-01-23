// Generate optimized static assets to replace expensive real-time SVG filters

export function initOptimizedTextures() {
  const urlParams = new URLSearchParams(window.location.search);

  // Check for query parameters to disable effects for performance testing
  if (!urlParams.has('noPaper')) {
    applyPaperTexture();
  }

  if (!urlParams.has('noTornEdge')) {
    applyTornEdgeFilter();
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

  // Set as background image on the canvas
  canvas.style.backgroundImage = `url("${url}")`;
}

function applyTornEdgeFilter() {
  const overlay = document.getElementById('clearOverlay');
  if (!overlay) return;

  // Create the torn edge filter as a blob URL for better cross-browser compatibility
  const filterSvg = `
  <svg xmlns='http://www.w3.org/2000/svg'>
    <defs>
      <filter id='torn-edge' x='-50%' y='-50%' width='200%' height='280%'>
        <feTurbulence type='fractalNoise' baseFrequency='0.01' numOctaves='4' seed='3' result='noise'/>
        <feDisplacementMap in='SourceGraphic' in2='noise' scale='45' xChannelSelector='R' yChannelSelector='G' result='torn'/>
        <feGaussianBlur in='torn' stdDeviation='3' result='blurredEdge'/>
        <feOffset in='blurredEdge' dx='0' dy='4' result='offsetShadow'/>
        <feFlood flood-color='rgba(0,0,0,0.25)' result='shadowColor'/>
        <feComposite in='shadowColor' in2='offsetShadow' operator='in' result='edgeShadow'/>
        <feMerge>
          <feMergeNode in='edgeShadow'/>
          <feMergeNode in='torn'/>
        </feMerge>
      </filter>
    </defs>
  </svg>`;

  const blob = new Blob([filterSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // Apply filter via blob URL
  overlay.style.filter = `url("${url}#torn-edge")`;
}
