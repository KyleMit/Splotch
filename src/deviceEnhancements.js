// Progressive enhancement: upgrade to SVG filters on capable devices
// iOS Safari has issues with external SVG references, so we default to CSS
// and only upgrade on non-iOS devices

export function initDeviceEnhancements() {
  const urlParams = new URLSearchParams(window.location.search);

  // Check for debug parameter to force CSS-only mode
  const debugIOS = urlParams.has('debugIOS');

  // Detect iOS devices
  // Check for iPad/iPhone/iPod in user agent, or iPad masquerading as desktop Safari
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);

  // Only apply SVG enhancements on non-iOS devices (unless debugging)
  if (!isIOS && !debugIOS) {
    applyTornEdgeSVG();
  }
}

function applyTornEdgeSVG() {
  const overlay = document.getElementById('clearOverlay');
  if (!overlay) return;

  // Override default CSS with SVG filter for better quality
  overlay.style.filter = "url('/filters/torn-edge.svg#torn-edge')";
}
