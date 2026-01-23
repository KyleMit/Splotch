import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Get build timestamp
function getVersion() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

// Plugin to inject version into HTML
function htmlVersionPlugin() {
  const version = getVersion();
  return {
    name: 'html-version-inject',
    transformIndexHtml(html) {
      return html.replace('%VERSION%', version);
    }
  };
}

export default defineConfig({
  plugins: [
    htmlVersionPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png', 'sounds/*.mp3'],
      manifest: false, // Use site.webmanifest instead
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,webmanifest}'],
        // Add skipWaiting and clientsClaim for immediate updates
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ]
});
