const { resolve } = require('node:path');

// The custom resolver option the page documents' bundle requests carry
// (tools/migration/prerender-native-web-pages.mjs). The drawing screen's export never sets it.
const PAGE_DOCUMENT_RESOLVER_OPTION = 'pageDocument';

// The drawing screen loads these modules after it paints, through a facade that renders nothing
// until the module arrives. A page document renders its whole page at build time and hydrates
// that markup, so its bundles resolve each facade to the module it wraps.
// tools/tests/native-web-page-documents.test.mjs holds each pair to the same exports.
const SRC = resolve(__dirname, '../src');
const PAGE_DOCUMENT_EAGER_MODULES = new Map([
  [resolve(SRC, 'platform/ScrollView.web.ts'), resolve(SRC, 'platform/ScrollViewContent.web.ts')],
  [
    resolve(SRC, 'rsdDrawing/RsdStepNumber.web.tsx'),
    resolve(SRC, 'rsdDrawing/RsdStepNumberContent.tsx'),
  ],
]);

function withPageDocumentResolution(context, moduleName, platform) {
  const resolution = context.resolveRequest(context, moduleName, platform);
  if (
    context.customResolverOptions?.[PAGE_DOCUMENT_RESOLVER_OPTION] !== true ||
    resolution.type !== 'sourceFile'
  )
    return resolution;
  const eager = PAGE_DOCUMENT_EAGER_MODULES.get(resolution.filePath);
  return eager === undefined ? resolution : { type: 'sourceFile', filePath: eager };
}

module.exports = {
  PAGE_DOCUMENT_RESOLVER_OPTION,
  PAGE_DOCUMENT_EAGER_MODULES,
  withPageDocumentResolution,
};
