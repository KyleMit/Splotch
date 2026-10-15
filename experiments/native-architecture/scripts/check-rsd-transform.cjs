const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, realpathSync } = require('node:fs');
const { dirname, join } = require('node:path');
const babel = require('@babel/core');
const { validateBrushSources } = require('./rsd-brush-source-guards.cjs');

const projectRoot = realpathSync(join(__dirname, '..'));
const source = (path) => readFileSync(join(projectRoot, path), 'utf8');
const parse = (path) =>
  babel.parseSync(source(path), {
    filename: join(projectRoot, path),
    babelrc: false,
    configFile: join(projectRoot, 'babel.config.cjs'),
    caller: { name: 'splotch-rsd-drawing-source', platform: 'ios', supportsStaticESM: true },
  });
function imported(ast, module, name) {
  return ast.program.body.some(
    (node) =>
      node.type === 'ImportDeclaration' &&
      node.source.value === module &&
      node.specifiers.some(
        (element) =>
          element.type === 'ImportSpecifier' &&
          element.local.name === name &&
          element.imported.name === name
      )
  );
}
assert.equal(process.argv.length, 2, 'RSD transform accepts no arguments');
assert.equal(JSON.parse(source('package.json')).main, 'src/index.ts', 'Canonical RSD entry');
const entry = parse('src/index.ts');
assert.ok(
  imported(entry, './platform/registerRoot', 'registerRootComponent'),
  'Registration import owner'
);
assert.ok(imported(entry, './ProbeApp', 'ProbeApp'), 'ProbeApp import owner');
const registrations = entry.program.body
  .filter(
    (node) =>
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'Identifier' &&
      node.expression.callee.name === 'registerRootComponent'
  )
  .map((node) => node.expression);
assert.equal(registrations.length, 1, 'Exactly one registration');
assert.equal(registrations[0].arguments.length, 1, 'Registration arity');
const registeredRoot = registrations[0].arguments[0];
assert.equal(registeredRoot.type, 'ConditionalExpression', 'Canonical registration mode');
assert.equal(registeredRoot.test.name, '__DEV__', 'Canonical registration development flag');
assert.equal(
  registeredRoot.consequent.name,
  'StrictProbeApp',
  'Canonical registration development root'
);
assert.equal(registeredRoot.alternate.name, 'ProbeApp', 'Canonical registration release root');
const probe = parse('src/ProbeApp.tsx');
assert.ok(
  imported(probe, './rsdDrawing/RsdDrawingScreen', 'RsdDrawingScreen'),
  'RSD screen import'
);
assert.ok(
  imported(probe, './product/DrawingSession', 'DrawingSessionProvider'),
  'Drawing session provider import'
);
const owner = probe.program.body.find(
  (node) =>
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'FunctionDeclaration' &&
    node.declaration.id?.name === 'ProbeApp'
)?.declaration;
assert.ok(owner, 'Exported ProbeApp');
const returns = owner.body.body.filter((node) => node.type === 'ReturnStatement');
assert.equal(returns.length, 1, 'ProbeApp has one return');
assert.ok(imported(probe, './product/AppRestart', 'AppRestartRoot'), 'App restart root import');
assert.equal(returns[0].argument?.type, 'JSXElement', 'Mounted app root');
const elementChildren = (node) => node.children.filter((child) => child.type === 'JSXElement');
assert.ok(
  imported(probe, './platform/AppSurfaceRoot', 'AppSurfaceRoot'),
  'App surface owner import'
);
assert.equal(returns[0].argument.openingElement.name.name, 'AppSurfaceRoot', 'Drawing app surface');
const appRoots = elementChildren(returns[0].argument);
assert.equal(appRoots.length, 1, 'App surface has one restartable root');
assert.equal(appRoots[0].openingElement.name.name, 'AppRestartRoot', 'Restartable app root');
const sessions = elementChildren(appRoots[0]);
assert.equal(sessions.length, 1, 'App root has one drawing session');
assert.equal(
  sessions[0].openingElement.name.name,
  'DrawingSessionProvider',
  'Mounted drawing session'
);
const fontGates = elementChildren(sessions[0]);
assert.equal(fontGates.length, 1, 'Drawing session has one font gate');
assert.equal(fontGates[0].openingElement.name.name, 'ShippingFontGate', 'Font-gated screen');
const boundaries = elementChildren(fontGates[0]);
assert.equal(boundaries.length, 1, 'Font gate has one screen boundary');
assert.equal(
  boundaries[0].openingElement.name.name,
  'RsdScreenBoundary',
  'Mounted screen boundary'
);
const routes = boundaries[0].children.filter((node) => node.type === 'JSXExpressionContainer');
assert.equal(routes.length, 1, 'Screen boundary has one page route');
const route = routes[0].expression;
assert.equal(route.type, 'ConditionalExpression', 'Mounted page route');
assert.equal(route.test.type, 'BinaryExpression', 'Mounted page condition');
assert.equal(route.test.operator, '===', 'Mounted page comparison');
assert.equal(route.test.left.name, 'page', 'Mounted page state');
assert.equal(route.test.right.value, 'notFound', 'Mounted not-found route');
assert.equal(
  route.consequent.openingElement.name.name,
  'RsdNotFoundPage',
  'Mounted not-found page'
);
const mountedScreen = route.alternate.openingElement;
assert.equal(mountedScreen.name.name, 'RsdDrawingScreen', 'Mounted RSD screen');
assert.ok(
  !mountedScreen.attributes.some((item) => item.name?.name === 'key'),
  'Stable drawing mount'
);
const pageProp = mountedScreen.attributes.find((item) => item.name?.name === 'page');
assert.equal(pageProp?.value?.expression?.name, 'page', 'Mounted drawing page state');
const drawing = parse('src/rsdDrawing/RsdDrawingScreen.tsx');
const edgeControls = parse('src/rsdDrawing/RsdEdgeControls.tsx');
const actionsPanel = parse('src/rsdDrawing/RsdActionsPanel.tsx');
const coloringPicker = parse('src/rsdDrawing/RsdColoringBookPicker.tsx');
const groups = [];
const switches = [];
const toolbarToggles = [];
const toolbarConditions = [];
let paints = 0;
const attribute = (node, name) =>
  node.attributes.find((item) => item.type === 'JSXAttribute' && item.name.name === name);
const literal = (item) => (item?.value?.type === 'StringLiteral' ? item.value.value : undefined);
const settingsDialog = parse('src/rsdDrawing/RsdSettingsDialog.tsx');
for (const component of [drawing, edgeControls, actionsPanel, coloringPicker, settingsDialog])
  babel.traverse(component, {
    JSXOpeningElement(path) {
      const node = path.node;
      if (literal(attribute(node, 'role')) === 'radiogroup')
        groups.push(attribute(node, 'aria-label'));
      if (
        node.name.type !== 'JSXIdentifier' ||
        !['RsdAction', 'RsdPaintAction', 'RsdIconButton'].includes(node.name.name) ||
        !attribute(node, 'selected')
      )
        return;
      if (node.name.name === 'RsdPaintAction') {
        assert.equal(attribute(node, 'selection'), undefined, 'RSD plain paint caller');
        paints++;
      } else if (node.name.name === 'RsdIconButton' && component === actionsPanel) {
        assert.equal(attribute(node, 'selection'), undefined, 'RSD toolbar button semantics');
        toolbarToggles.push(node);
        toolbarConditions.push(
          path.findParent((parent) => parent.isConditionalExpression() || parent.isIfStatement())
            ?.node.test
        );
      } else switches.push(node);
    },
  });
assert.equal(groups.length, 0, 'RSD palette radio group count');
assert.equal(paints, 1, 'RSD paint callers');
for (const file of ['RsdSwatch.tsx', 'RsdColorMenu.tsx'])
  babel.traverse(parse('src/rsdDrawing/' + file), {
    JSXOpeningElement({ node }) {
      if (node.name.name !== 'RsdPressable') return;
      const stateless = file === 'RsdSwatch.tsx';
      for (const name of stateless
        ? ['role', 'aria-checked', 'aria-pressed']
        : ['role', 'aria-checked'])
        assert.equal(attribute(node, name), undefined, 'RSD plain paint button');
      if (!stateless) assert.ok(attribute(node, 'aria-pressed'), 'RSD pressed paint button');
    },
  });
let pressedButtons = 0;
babel.traverse(parse('src/rsdDrawing/RsdIconButton.tsx'), {
  JSXOpeningElement({ node }) {
    if (node.name.name !== 'RsdPressable' || !attribute(node, 'aria-pressed')) return;
    pressedButtons++;
    assert.equal(literal(attribute(node, 'role')), 'button', 'RSD pressed button role');
    assert.equal(attribute(node, 'aria-checked'), undefined, 'RSD pressed button checked state');
    const selected = attribute(node, 'aria-pressed').value?.expression;
    assert.ok(
      selected?.type === 'MemberExpression' &&
        !selected.computed &&
        selected.object.name === 'props' &&
        selected.property.name === 'selected',
      'RSD pressed button state owner'
    );
  },
});
assert.equal(pressedButtons, 1, 'RSD pressed button owner');
// Every Settings switch is a toggle row in its own section module; none is a selected action.
assert.equal(switches.length, 0, 'RSD switch state callers');
const { optionalBrushes, optionalLabels, assertTransformedBrushToggles } = validateBrushSources({
  parse,
  babel,
  toolbarToggles,
  toolbarConditions,
  attribute,
});
const files = [
  'src/platform/BrowserBack.tsx',
  'src/platform/BrowserBack.web.tsx',
  'src/product/browserBack.ts',
  'src/rsdDrawing/RsdColorPicker.tsx',
  'src/platform/useFullscreen.ts',
  'src/platform/useFullscreen.web.ts',
  'src/platform/offlineLibrary.web.ts',
  'src/platform/offlineLibraryStorage.web.ts',
  'src/platform/offlineLibraryTransfer.web.ts',
  'src/drawing/crayon.ts',
  'src/drawing/crayonGrain.ts',
  'src/platform/useUndoShortcut.ts',
  'src/platform/useUndoShortcut.web.ts',
  'src/product/useDrawingUndoShortcut.ts',
  'src/product/useProductModalRoute.ts',
  'src/parentCenter/parentPolicy.ts',
  'src/settings/soundVolume.ts',
  'src/settings/toolbarStyle.ts',
  'src/rsdDrawing/RsdAppearanceSection.tsx',
  'src/rsdDrawing/RsdSoundSection.tsx',
  'src/rsdDrawing/RsdAccessibilitySection.tsx',
  'src/settings/soundSettings.ts',
  'src/settings/soundSettingsCodec.ts',
  'src/settings/drawingControlPreferences.ts',
  'src/platform/aiImage.web.ts',
  'src/platform/ai.web.ts',
  'src/platform/aiVault.web.ts',
  'src/platform/aiVaultRecords.web.ts',
  'src/platform/aiStorage.web.ts',
  'src/platform/aiStorageOwner.web.ts',
  'src/platform/aiStorageRecords.web.ts',
  'src/platform/aiRecoveryStorage.native.ts',
  'src/platform/aiRecoveryStorage.web.ts',
  'src/platform/recoveryReceiptOwner.ts',
  'src/ai/recoveryDigest.ts',
  'src/ai/recoveryRequest.ts',
  'src/ai/credentialLease.ts',
  'src/ai/recoveryBoundary.ts',
  'src/ai/recoveryTransport.ts',
  'src/ai/recoveryReport.ts',
  'src/ai/responseBytes.ts',
  'src/ai/sessionContract.ts',
  'src/platform/ai.ts',
  'src/ai/transport.ts',
  'src/ai/session.ts',
  'src/ai/recoverySession.ts',
  'src/ai/recoveryContract.ts',
  'src/ai/credentials.ts',
  'src/audio/drawingAudio.ts',
  'src/product/useDrawingProduct.ts',
  'src/useDrawingSound.ts',
  'src/drawing/useCrayonTileReadiness.tsx',
  'src/ai/reportContract.ts',
  'src/ai/reportTransport.ts',
  'src/ai/reportOwner.ts',
  'src/platform/aiOriginalModel.ts',
  'src/useRendererRecovery.ts',
  'src/useDrawingScreen.ts',
  'src/index.ts',
  'src/ProbeApp.tsx',
  'src/product/createDrawingSession.ts',
  'src/product/DrawingSession.tsx',
  'src/rsdDrawing/RsdAboutSection.tsx',
  'src/rsdDrawing/RsdWhatsNewSection.tsx',
  'src/rsdDrawing/RsdFeedbackSection.tsx',
  'src/rsdDrawing/RsdDrawingScreen.tsx',
  'src/rsdDrawing/RsdEdgeControls.tsx',
  'src/rsdDrawing/RsdActionsPanel.tsx',
  'src/rsdDrawing/RsdToolFlyouts.tsx',
  'src/rsdDrawing/RsdFullscreenToggle.tsx',
  'src/rsdDrawing/RsdAiStylePrompt.tsx',
  'src/rsdDrawing/RsdAiResult.tsx',
  'src/rsdDrawing/RsdAiResultParts.tsx',
  'src/rsdDrawing/RsdAiResultError.tsx',
  'src/rsdDrawing/RsdAiResultStage.tsx',
  'src/rsdDrawing/RsdAiImageReport.tsx',
  'src/ai/stylePreviewAssets.ts',
  'src/rsdDrawing/RsdDrawingStatus.tsx',
  'src/rsdDrawing/RsdSwatch.tsx',
  'src/rsdDrawing/paletteGeometry.ts',
  'src/rsdDrawing/RsdColoringBookPicker.tsx',
  'src/rsdDrawing/controls.tsx',
  'src/rsdDrawing/RsdIcon.tsx',
  'src/rsdDrawing/icons.generated.ts',
  'src/rsdDrawing/tokens.css.ts',
  'src/rsdDrawing/NativeFrame.tsx',
  'src/rsdDrawing/NativePaper.tsx',
  'src/rsdDrawing/ModalShell.tsx',
  'src/rsdDrawing/ModalShellContent.tsx',
  'src/rsdDrawing/useModalFrame.ts',
  'src/rsdDrawing/DialogHeader.tsx',
  'src/rsdDrawing/RsdSettingsDialog.tsx',
  'src/rsdDrawing/RsdSettingsRoute.tsx',
  'src/rsdDrawing/NativeScrollAreas.tsx',
  'src/drawing/brushes.ts',
  'src/settings/brushPreferences.ts',
  'src/useBrushPreferences.ts',
  'src/platform/brushPreferences.ts',
  'src/platform/brushPreferences.web.ts',
];
const nativeAdapters = new Set([
  'src/rsdDrawing/RsdColoringBookPicker.tsx',
  'src/rsdDrawing/NativeFrame.tsx',
  'src/rsdDrawing/NativePaper.tsx',
  'src/rsdDrawing/ModalShellContent.tsx',
  'src/rsdDrawing/RsdColorPicker.tsx',
  'src/rsdDrawing/DialogHeader.tsx',
  'src/rsdDrawing/NativeScrollAreas.tsx',
]);
const rsdPackage = require.resolve('react-strict-dom/package.json');
assert.equal(
  JSON.parse(readFileSync(rsdPackage, 'utf8')).version,
  '0.0.54',
  'Released RSD identity'
);
const releasedNative = join(dirname(rsdPackage), 'dist/native/index.js');
const rows = [];
for (const file of [...files, releasedNative]) {
  const filename = file === releasedNative ? file : join(projectRoot, file);
  const result = babel.transformFileSync(filename, {
    ast: true,
    babelrc: false,
    configFile: join(projectRoot, 'babel.config.cjs'),
    cwd: projectRoot,
    envName: 'production',
    caller: { name: 'splotch-rsd-drawing', platform: 'ios', supportsStaticESM: true },
  });
  assert.ok(result?.ast && typeof result.code === 'string', 'Actual Babel output');
  let nativeImport = false;
  babel.traverse(result.ast, {
    ImportDeclaration({ node }) {
      if (node.source.value === 'react-native') nativeImport = true;
    },
    JSXElement() {
      throw new Error('RSD Babel left JSX');
    },
    JSXFragment() {
      throw new Error('RSD Babel left JSX');
    },
  });
  assertTransformedBrushToggles(result.ast, file);
  if (nativeAdapters.has(file)) assert.ok(nativeImport, `Native adapter import removed: ${file}`);
  rows.push({
    file,
    sourceSha256: createHash('sha256').update(readFileSync(filename)).digest('hex'),
    codeSha256: createHash('sha256').update(result.code).digest('hex'),
  });
}
process.stdout.write(
  `${JSON.stringify({
    canonicalEntry: true,
    mountedRsdSource: true,
    optionalBrushToggles: optionalBrushes.elements.length,
    optionalBrushLabels: optionalLabels,
    adaptiveToolbarToggle: true,
    preservedSettingsSwitches: switches.length,
    releasedNative,
    rows,
    scope: 'Babel and canonical source only; no native mount or drawing result',
  })}\n`
);
