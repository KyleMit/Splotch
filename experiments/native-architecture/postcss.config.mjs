import reactStrictPlugin from 'react-strict-dom/postcss-plugin';
import { ADMIN_DOCUMENT_SOURCES } from './scripts/admin-document-styles.mjs';

export default {
  plugins: [
    reactStrictPlugin({
      cwd: import.meta.dirname,
      include: ['src/**/*.{ts,tsx}'],
      // Android and iOS files theme from runtime values that the static web compile rejects. The
      // admin console's rules go into its own document instead.
      exclude: ['src/**/*.native.{ts,tsx}', ADMIN_DOCUMENT_SOURCES],
    }),
  ],
};
