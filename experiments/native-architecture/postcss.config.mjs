import reactStrictPlugin from 'react-strict-dom/postcss-plugin';
import pageDocumentResolution from './scripts/page-document-resolution.cjs';

export default {
  plugins: [
    reactStrictPlugin({
      cwd: import.meta.dirname,
      include: ['src/**/*.{ts,tsx}'],
      // Android and iOS files theme from runtime values that the static web compile rejects. The
      // styleguide's styles go only into its own document, never the sheet every document inlines.
      exclude: ['src/**/*.native.{ts,tsx}', pageDocumentResolution.DESIGN_DOCUMENT_STYLE_SOURCES],
    }),
  ],
};
