// Version display in parent guide footer

export function initVersion() {
  const versionElement = document.getElementById('versionText');

  if (versionElement) {
    // Set version text (injected by Vite at build time)
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    versionElement.textContent = `Version ${version}`;
  }
}
