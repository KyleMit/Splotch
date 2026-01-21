import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Get build timestamp
function getVersion() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getVersion())
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon-96x96.png', 'apple-touch-icon.png', 'sounds/*.mp3'],
      manifest: false, // Use site.webmanifest instead
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,webmanifest}'],
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
