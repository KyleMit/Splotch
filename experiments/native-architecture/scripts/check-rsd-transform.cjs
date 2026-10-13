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
assert.ok(imported(entry, 'expo', 'registerRootComponent'), 'Registration import owner');
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
assert.equal(registrations[0].arguments[0].name, 'ProbeApp', 'Canonical registration');
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
assert.equal(returns[0].argument?.type, 'JSXElement', 'Mounted drawing session');
assert.equal(
  returns[0].argument.openingElement.name.name,
  'DrawingSessionProvider',
  'Mounted drawing session'
);
const elementChildren = (node) => node.children.filter((child) => child.type === 'JSXElement');
const fontGates = elementChildren(returns[0].argument);
assert.equal(fontGates.length, 1, 'Drawing session has one font gate');
assert.equal(fontGates[0].openingElement.name.name, 'ShippingFontGate', 'Font-gated screen');
const mountedScreens = elementChildren(fontGates[0]);
assert.equal(mountedScreens.length, 1, 'Font gate has one screen');
assert.equal(mountedScreens[0].openingElement.name.name, 'RsdDrawingScreen', 'Mounted RSD screen');
const drawing = parse('src/rsdDrawing/RsdDrawingScreen.tsx');
const edgeControls = parse('src/rsdDrawing/RsdEdgeControls.tsx');
const drawingTools = parse('src/rsdDrawing/RsdDrawingTools.tsx');
const coloringPicker = parse('src/rsdDrawing/RsdColoringBookPicker.tsx');
const groups = [];
const switches = [];
const toolbarSwitches = [];
const toolbarConditions = [];
const optionalSwitches = [];
let radios = 0;
const attribute = (node, name) =>
  node.attributes.find((item) => item.type === 'JSXAttribute' && item.name.name === name);
const literal = (item) => (item?.value?.type === 'StringLiteral' ? item.value.value : undefined);
const settingsDialog = parse('src/rsdDrawing/RsdSettingsDialog.tsx');
const orientationChoices = parse('src/rsdDrawing/RsdOrientationChoices.tsx');
for (const component of [
  drawing,
  edgeControls,
  drawingTools,
  coloringPicker,
  settingsDialog,
  orientationChoices,
])
  babel.traverse(component, {
    JSXOpeningElement(path) {
      const node = path.node;
      if (literal(attribute(node, 'role')) === 'radiogroup')
        groups.push(attribute(node, 'aria-label'));
      if (
        node.name.type !== 'JSXIdentifier' ||
        !['RsdAction', 'RsdPaintAction'].includes(node.name.name) ||
        !attribute(node, 'selected')
      )
        return;
      const selection =
        node.name.name === 'RsdPaintAction' ? 'radio' : literal(attribute(node, 'selection'));
      if (selection === 'switch') {
        if (component === edgeControls) {
          toolbarSwitches.push(node);
          toolbarConditions.push(
            path.findParent((parent) => parent.isConditionalExpression())?.node.test
          );
        } else {
          const map = path.findParent(
            (parent) =>
              parent.isCallExpression() &&
              parent.node.arguments.some(
                (argument) =>
                  argument.type === 'ArrowFunctionExpression' &&
                  argument.body.type === 'JSXElement' &&
                  argument.body.openingElement === node
              )
          );
          if (component === settingsDialog && map) optionalSwitches.push({ node, map: map.node });
          else switches.push(node);
        }
        return;
      }
      assert.equal(selection, 'radio', 'RSD selected action mode');
      radios++;
      const group = path.findParent(
        (parent) =>
          parent.isJSXElement() &&
          literal(attribute(parent.node.openingElement, 'role')) === 'radiogroup'
      );
      assert.ok(group, 'RSD radio group owner');
    },
  });
assert.equal(groups.length, 6, 'RSD radio group count');
assert.deepEqual(
  groups.map(literal).filter(Boolean).sort(),
  ['Appearance', 'Drawing brush', 'Drawing sound level', 'Orientation', 'Paint colors'],
  'RSD radio group names'
);
const dynamicLabel = groups.find((item) => item?.value?.type === 'JSXExpressionContainer');
assert.equal(dynamicLabel?.value.expression.type, 'TemplateLiteral', 'RSD width group label');
assert.deepEqual(
  dynamicLabel.value.expression.quasis.map((item) => item.value.cooked),
  ['', ' width'],
  'RSD width group label'
);
assert.equal(dynamicLabel.value.expression.expressions[0]?.name, 'tool', 'RSD width group owner');
assert.equal(radios, 6, 'RSD selection callers');
const settingsValue = (expression, property) =>
  expression?.type === 'MemberExpression' &&
  !expression.computed &&
  expression.object.type === 'Identifier' &&
  expression.object.name === 'settings' &&
  expression.property.type === 'Identifier' &&
  expression.property.name === property;
const selectedValue = (node) => attribute(node, 'selected')?.value?.expression;
assert.ok(
  switches.every((node) =>
    [
      'soundEnabled',
      'undoButtonEnabled',
      'strokeWidthControlEnabled',
      'saveOnDeleteEnabled',
      'pencilEraserEnabled',
    ].some((property) => settingsValue(selectedValue(node), property))
  ),
  'RSD switch state owner'
);
assert.deepEqual(
  switches.map((node) => selectedValue(node).property.name).sort(),
  [
    'pencilEraserEnabled',
    'saveOnDeleteEnabled',
    'soundEnabled',
    'strokeWidthControlEnabled',
    'undoButtonEnabled',
  ],
  'RSD switch state callers'
);
function switchCallback(property, enabledLabel, disabledLabel) {
  const node = switches.find((item) => settingsValue(selectedValue(item), property));
  const label = attribute(node, 'label')?.value?.expression;
  assert.ok(
    label?.type === 'ConditionalExpression' &&
      settingsValue(label.test, property) &&
      label.consequent.type === 'StringLiteral' &&
      label.consequent.value === enabledLabel &&
      label.alternate.type === 'StringLiteral' &&
      label.alternate.value === disabledLabel,
    'RSD ' + property + ' switch labels'
  );
  return attribute(node, 'onClick')?.value?.expression;
}
const soundToggle = switchCallback('soundEnabled', 'Drawing sound on', 'Drawing sound off');
assert.ok(
  soundToggle?.type === 'Identifier' && soundToggle.name === 'onToggle',
  'RSD sound switch callback'
);
const { optionalBrushes, optionalLabels, assertTransformedBrushSwitches } = validateBrushSources({
  parse,
  imported,
  babel,
  settingsDialog,
  optionalSwitches,
  toolbarSwitches,
  toolbarConditions,
  attribute,
  settingsValue,
});
const labelText = (node) =>
  literal(attribute(node, 'label')) ?? attribute(node, 'label')?.value?.expression?.name;
for (const [property, label, callback] of [
  ['undoButtonEnabled', 'Show Undo button', 'onUndoButtonChange'],
  ['strokeWidthControlEnabled', 'Show drawing width controls', 'onStrokeWidthControlChange'],
  ['saveOnDeleteEnabled', 'SAVE_ON_DELETE_LABEL', 'onSaveOnDeleteChange'],
  ['pencilEraserEnabled', 'PENCIL_ERASER_LABEL', 'onPencilEraserChange'],
]) {
  const node = switches.find((item) => settingsValue(selectedValue(item), property));
  assert.equal(labelText(node), label, 'RSD control switch label');
  assert.equal(
    attribute(node, 'disabled')?.value?.expression.name,
    'busy',
    'RSD control switch guard'
  );
  const handler = attribute(node, 'onClick')?.value?.expression;
  assert.ok(
    handler?.type === 'ArrowFunctionExpression' &&
      !handler.async &&
      handler.params.length === 0 &&
      handler.body.type === 'CallExpression' &&
      handler.body.callee.type === 'Identifier' &&
      handler.body.callee.name === callback &&
      handler.body.arguments.length === 1 &&
      handler.body.arguments[0].type === 'UnaryExpression' &&
      handler.body.arguments[0].operator === '!' &&
      settingsValue(handler.body.arguments[0].argument, property),
    'RSD control switch owner'
  );
}
const files = [
  'src/platform/BrowserBack.tsx',
  'src/platform/BrowserBack.web.tsx',
  'src/platform/DrawingModal.tsx',
  'src/product/browserBack.ts',
  'src/rsdDrawing/RsdColorPicker.tsx',
  'src/ColoringPagePicker.tsx',
  'src/feedback/FeedbackSheet.tsx',
  'src/parentCenter/ParentGateSheet.tsx',
  'src/parentCenter/ParentCenterSection.tsx',
  'src/drawing/SavedPictures.tsx',
  'src/ai/AiSheet.tsx',
  'src/platform/useFullscreen.ts',
  'src/platform/useFullscreen.web.ts',
  'src/rsdDrawing/RsdDrawingTools.tsx',
  'src/DrawingControls.tsx',
  'src/DrawingScreen.tsx',
  'src/platform/offlineLibrary.web.ts',
  'src/platform/offlineLibraryStorage.web.ts',
  'src/platform/offlineLibraryTransfer.web.ts',
  'src/platform/drawingFiles.web.ts',
  'src/platform/pngRecovery.web.ts',
  'src/drawing/crayon.ts',
  'src/drawing/crayonGrain.ts',
  'src/platform/useUndoShortcut.ts',
  'src/platform/useUndoShortcut.web.ts',
  'src/product/useDrawingUndoShortcut.ts',
  'src/product/useProductModalRoute.ts',
  'src/parentCenter/parentPolicy.ts',
  'src/settings/soundLevel.ts',
  'src/settings/soundSettings.ts',
  'src/settings/soundSettingsCodec.ts',
  'src/settings/drawingControlPreferences.ts',
  'src/settings/DrawingControlChoices.tsx',
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
  'src/settings/SoundSettingsSheet.tsx',
  'src/drawing/useCrayonTileReadiness.tsx',
  'src/ai/reportContract.ts',
  'src/ai/reportTransport.ts',
  'src/ai/reportOwner.ts',
  'src/ai/AiPictureReport.tsx',
  'src/ai/useAiPictureShare.ts',
  'src/platform/aiShare.ts',
  'src/platform/aiShare.web.ts',
  'src/platform/aiOriginalModel.ts',
  'src/useRendererRecovery.ts',
  'src/useDrawingScreen.ts',
  'src/index.ts',
  'src/ProbeApp.tsx',
  'src/product/createDrawingSession.ts',
  'src/product/DrawingSession.tsx',
  'src/product/createDrawingDraft.ts',
  'src/product/drawingDraft.ts',
  'src/product/useDraftNotice.ts',
  'src/platform/drawingDraft.ts',
  'src/platform/drawingDraft.web.ts',
  'src/platform/drawingDraftOwner.web.ts',
  'src/platform/drawingDraftRecords.web.ts',
  'src/information/content.ts',
  'src/information/InformationSection.tsx',
  'src/rsdDrawing/RsdInformationSection.tsx',
  'src/rsdDrawing/RsdDrawingScreen.tsx',
  'src/rsdDrawing/RsdEdgeControls.tsx',
  'src/rsdDrawing/RsdAiSheet.tsx',
  'src/ai/useAiPictureViewer.ts',
  'src/ai/AiPictureViewport.tsx',
  'src/ai/CurrentDrawingPreview.tsx',
  'src/ai/AiRecoveryActions.tsx',
  'src/ai/AiStylePreview.tsx',
  'src/ai/stylePreviewAssets.ts',
  'src/ai/NativeAiPictureView.tsx',
  'src/ai/NativeAiStyleChoices.tsx',
  'src/rsdDrawing/RsdAiPictureView.tsx',
  'src/rsdDrawing/RsdAiStyleChoices.tsx',
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
  'src/rsdDrawing/DialogHeader.tsx',
  'src/rsdDrawing/RsdSettingsDialog.tsx',
  'src/rsdDrawing/RsdSettingsRoute.tsx',
  'src/rsdDrawing/RsdOrientationChoices.tsx',
  'src/rsdDrawing/NativeScrollAreas.tsx',
  'src/rsdDrawing/RsdRecoveryNotice.tsx',
  'src/useDrawingMenu.ts',
  'src/drawing/brushes.ts',
  'src/settings/brushPreferences.ts',
  'src/useBrushPreferences.ts',
  'src/platform/brushPreferences.ts',
  'src/platform/brushPreferences.web.ts',
];
const nativeAdapters = new Set([
  'src/rsdDrawing/RsdColoringBookPicker.tsx',
  'src/rsdDrawing/RsdRecoveryNotice.tsx',
  'src/rsdDrawing/NativeFrame.tsx',
  'src/rsdDrawing/NativePaper.tsx',
  'src/rsdDrawing/ModalShell.tsx',
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
  assertTransformedBrushSwitches(result.ast, file);
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
    optionalBrushSwitches: optionalBrushes.elements.length,
    optionalBrushLabels: optionalLabels.map((label) => `Show ${label}`),
    adaptiveToolbarSwitch: true,
    preservedSettingsSwitches: switches.length,
    releasedNative,
    rows,
    scope: 'Babel and canonical source only; no native mount or drawing result',
  })}\n`
);
