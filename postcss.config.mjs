import reactStrictPlugin from 'react-strict-dom/postcss-plugin';
import { ADMIN_DOCUMENT_SOURCES } from './tools/migration/admin-document-styles.mjs';
import { DESIGN_DOCUMENT_STYLE_SOURCES } from './tools/migration/design-document-styles.mjs';

export default {
  plugins: [
    reactStrictPlugin({
      cwd: import.meta.dirname,
      include: ['src/**/*.{ts,tsx}'],
      // Android and iOS files theme from runtime values that the static web compile rejects. The
      // admin console's and the styleguide's rules go into their own documents instead.
      exclude: ['src/**/*.native.{ts,tsx}', ADMIN_DOCUMENT_SOURCES, DESIGN_DOCUMENT_STYLE_SOURCES],
    }),
  ],
};
