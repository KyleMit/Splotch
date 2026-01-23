// Progressive enhancement: upgrade to SVG filters on capable devices
// iOS Safari has issues with external SVG references, so we default to CSS
// and only upgrade on non-iOS devices

export function initDeviceEnhancements() {
  const urlParams = new URLSearchParams(window.location.search);

  // Check for debug parameter to force CSS-only mode
  const debugIOS = urlParams.has('debugIOS');

  // Detect iOS devices
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Only apply SVG enhancements on non-iOS devices (unless debugging)
  if (!isIOS && !debugIOS) {
    applyTornEdgeSVG();
    applyPaperGrainSVG();
  }
}

function applyTornEdgeSVG() {
  const overlay = document.getElementById('clearOverlay');
  if (!overlay) return;

  // Override default CSS with SVG filter for better quality
  overlay.style.filter = "url('/filters/torn-edge.svg#torn-edge')";
}

function applyPaperGrainSVG() {
  const canvas = document.getElementById('drawingCanvas');
  if (!canvas) return;

  // Apply paper grain texture as background
  canvas.style.backgroundImage = "url('/filters/paper-grain.svg')";
}
