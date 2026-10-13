const assert = require('node:assert/strict');

function validateBrushSources({
  parse,
  imported,
  babel,
  settingsDialog,
  optionalSwitches,
  toolbarSwitches,
  toolbarConditions,
  attribute,
  settingsValue,
}) {
  const unwrap = (node) => {
    while (['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'].includes(node?.type))
      node = node.expression;
    return node;
  };
  const namedMember = (node, object, property) =>
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === object &&
    node.property.type === 'Identifier' &&
    node.property.name === property;
  const identifier = (node, name) => node?.type === 'Identifier' && node.name === name;
  const expressionValue = (node, name) => {
    if (node.type === 'ObjectExpression')
      return node.properties.find(
        (item) =>
          item.type === 'ObjectProperty' &&
          !item.computed &&
          (identifier(item.key, name) ||
            (item.key.type === 'StringLiteral' && item.key.value === name))
      )?.value;
    return attribute(node, name)?.value?.expression;
  };
  const availabilityValue = (node) =>
    node?.type === 'MemberExpression' &&
    node.computed &&
    namedMember(node.object, 'brushState', 'availability') &&
    identifier(node.property, 'brush');
  // The toolbar reads the brush control through a local alias, as RsdActionsPanel does.
  const brushControl = (node) =>
    namedMember(node, 'screen', 'brushControl') || identifier(node, 'control');
  const controlBrush = (node) =>
    node?.type === 'MemberExpression' &&
    !node.computed &&
    brushControl(node.object) &&
    identifier(node.property, 'brush');
  const toolbarSelected = (node) =>
    node?.type === 'BinaryExpression' &&
    node.operator === '===' &&
    namedMember(node.left, 'screen', 'brush') &&
    controlBrush(node.right);
  const brushLabel = (node, expectedBrush, table = 'BRUSHES') =>
    node?.type === 'MemberExpression' &&
    !node.computed &&
    identifier(node.property, 'label') &&
    node.object.type === 'MemberExpression' &&
    node.object.computed &&
    identifier(node.object.object, table) &&
    expectedBrush(node.object.property);
  function assertOptionalSwitch(node, prefix) {
    assert.ok(availabilityValue(expressionValue(node, 'selected')), prefix + ' state owner');
    const label = expressionValue(node, 'label');
    assert.ok(
      label?.type === 'TemplateLiteral' &&
        label.quasis.length === 2 &&
        label.quasis[0].value.cooked === 'Show ' &&
        label.quasis[1].value.cooked === '' &&
        label.expressions.length === 1 &&
        brushLabel(label.expressions[0], (value) => identifier(value, 'brush')),
      prefix + ' labels'
    );
    const disabled = expressionValue(node, 'disabled');
    assert.ok(
      disabled?.type === 'LogicalExpression' &&
        disabled.operator === '||' &&
        identifier(disabled.left, 'busy') &&
        disabled.right.type === 'BinaryExpression' &&
        disabled.right.operator === '!==' &&
        namedMember(disabled.right.left, 'brushState', 'status') &&
        disabled.right.right.type === 'StringLiteral' &&
        disabled.right.right.value === 'ready',
      prefix + ' disabled owner'
    );
    const callback = expressionValue(node, 'onClick');
    assert.ok(
      callback?.type === 'ArrowFunctionExpression' &&
        !callback.async &&
        callback.params.length === 0 &&
        callback.body.type === 'CallExpression' &&
        identifier(callback.body.callee, 'onBrushAvailabilityChange') &&
        callback.body.arguments.length === 2 &&
        identifier(callback.body.arguments[0], 'brush') &&
        callback.body.arguments[1].type === 'UnaryExpression' &&
        callback.body.arguments[1].operator === '!' &&
        availabilityValue(callback.body.arguments[1].argument),
      prefix + ' callback'
    );
  }
  function assertToolbarSwitch(node, prefix) {
    assert.ok(toolbarSelected(expressionValue(node, 'selected')), prefix + ' state owner');
    assert.ok(
      brushLabel(expressionValue(node, 'label'), controlBrush, 'BRUSH_MENU_OPTIONS'),
      prefix + ' labels'
    );
    assert.ok(
      namedMember(expressionValue(node, 'onPress'), 'screen', 'toggleBrush'),
      prefix + ' callback'
    );
    assert.ok(
      identifier(expressionValue(node, 'disabled'), 'disabled'),
      prefix + ' disabled owner'
    );
  }
  const exportValue = (ast, name) =>
    ast.program.body
      .filter(
        (node) =>
          node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
      )
      .flatMap((node) => node.declaration.declarations)
      .find((node) => identifier(node.id, name))?.init;
  const brushPreferences = parse('src/settings/brushPreferences.ts');
  const optionalBrushes = unwrap(exportValue(brushPreferences, 'OPTIONAL_BRUSHES'));
  assert.equal(optionalBrushes?.type, 'ArrayExpression', 'RSD optional brush set');
  assert.deepEqual(
    optionalBrushes.elements.map((node) => (node?.type === 'StringLiteral' ? node.value : null)),
    ['crayon', 'magic', 'eraser'],
    'RSD optional brush set'
  );
  const brushPolicy = brushPreferences.program.body.find(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration' &&
      identifier(node.declaration.id, 'brushControl')
  )?.declaration;
  assert.ok(
    brushPolicy &&
      brushPolicy.params.length === 1 &&
      identifier(brushPolicy.params[0], 'availability'),
    'RSD brush control owner'
  );
  const policyBody = brushPolicy.body.body;
  assert.equal(policyBody.length, 4, 'RSD brush control finite policy');
  const optionalDeclaration = policyBody[0];
  const availableOptional =
    optionalDeclaration.type === 'VariableDeclaration' &&
    optionalDeclaration.declarations.length === 1 &&
    identifier(optionalDeclaration.declarations[0].id, 'optional')
      ? optionalDeclaration.declarations[0].init
      : null;
  assert.ok(
    availableOptional?.type === 'CallExpression' &&
      namedMember(availableOptional.callee, 'OPTIONAL_BRUSHES', 'filter') &&
      availableOptional.arguments.length === 1 &&
      availableOptional.arguments[0].type === 'ArrowFunctionExpression' &&
      !availableOptional.arguments[0].async &&
      availableOptional.arguments[0].params.length === 1 &&
      identifier(availableOptional.arguments[0].params[0], 'brush') &&
      availableOptional.arguments[0].body.type === 'MemberExpression' &&
      availableOptional.arguments[0].body.computed &&
      identifier(availableOptional.arguments[0].body.object, 'availability') &&
      identifier(availableOptional.arguments[0].body.property, 'brush'),
    'RSD brush control availability owner'
  );
  for (const [index, count, kind] of [
    [1, 0, 'none'],
    [2, 1, 'toggle'],
  ]) {
    const branch = policyBody[index];
    const result = unwrap(branch?.consequent?.argument);
    assert.ok(
      branch?.type === 'IfStatement' &&
        branch.test.type === 'BinaryExpression' &&
        branch.test.operator === '===' &&
        namedMember(branch.test.left, 'optional', 'length') &&
        branch.test.right.type === 'NumericLiteral' &&
        branch.test.right.value === count &&
        !branch.alternate &&
        branch.consequent.type === 'ReturnStatement' &&
        result?.type === 'ObjectExpression' &&
        expressionValue(result, 'kind')?.type === 'StringLiteral' &&
        expressionValue(result, 'kind').value === kind,
      'RSD brush control ' + count + ' optional policy'
    );
    assert.equal(
      result.properties.length,
      count === 0 ? 1 : 2,
      'RSD brush control ' + count + ' optional fields'
    );
    if (count === 1) {
      const brush = expressionValue(result, 'brush');
      assert.ok(
        brush?.type === 'MemberExpression' &&
          brush.computed &&
          identifier(brush.object, 'optional') &&
          brush.property.type === 'NumericLiteral' &&
          brush.property.value === 0,
        'RSD brush control toggle owner'
      );
    }
  }
  const menuPolicy = policyBody[3];
  const menuValue = unwrap(menuPolicy?.argument);
  const menuBrushes =
    menuValue?.type === 'ObjectExpression' ? expressionValue(menuValue, 'brushes') : null;
  assert.ok(
    menuPolicy?.type === 'ReturnStatement' &&
      menuValue?.type === 'ObjectExpression' &&
      menuValue.properties.length === 2 &&
      expressionValue(menuValue, 'kind')?.type === 'StringLiteral' &&
      expressionValue(menuValue, 'kind').value === 'menu' &&
      menuBrushes?.type === 'CallExpression' &&
      identifier(menuBrushes.callee, 'availableBrushes') &&
      menuBrushes.arguments.length === 1 &&
      identifier(menuBrushes.arguments[0], 'availability'),
    'RSD brush control many optional policy'
  );
  assert.ok(
    imported(settingsDialog, '../settings/brushPreferences', 'OPTIONAL_BRUSHES'),
    'RSD optional brush import owner'
  );
  assert.ok(
    imported(settingsDialog, '../drawing/brushes', 'BRUSHES'),
    'RSD optional brush label import owner'
  );
  const brushDefinitions = unwrap(exportValue(parse('src/drawing/brushes.ts'), 'BRUSHES'));
  assert.equal(brushDefinitions?.type, 'ObjectExpression', 'RSD optional brush label definitions');
  const optionalLabels = ['crayon', 'magic', 'eraser'].map((name) => {
    const definition = unwrap(
      brushDefinitions.properties.find(
        (node) => node.type === 'ObjectProperty' && !node.computed && identifier(node.key, name)
      )?.value
    );
    const label =
      definition?.type === 'ObjectExpression' ? expressionValue(definition, 'label') : null;
    return label?.type === 'StringLiteral' ? label.value : null;
  });
  assert.deepEqual(
    optionalLabels,
    ['Crayon', 'Magic Brush', 'Eraser'],
    'RSD optional brush labels'
  );
  assert.equal(optionalSwitches.length, 1, 'RSD optional brush switch template count');
  const optional = optionalSwitches[0];
  assert.ok(
    optional.map.callee.type === 'MemberExpression' &&
      !optional.map.callee.computed &&
      identifier(optional.map.callee.object, 'OPTIONAL_BRUSHES') &&
      identifier(optional.map.callee.property, 'map') &&
      optional.map.arguments.length === 1 &&
      optional.map.arguments[0].type === 'ArrowFunctionExpression' &&
      !optional.map.arguments[0].async &&
      optional.map.arguments[0].params.length === 1 &&
      identifier(optional.map.arguments[0].params[0], 'brush') &&
      optional.map.arguments[0].body.type === 'JSXElement' &&
      optional.map.arguments[0].body.openingElement === optional.node,
    'RSD optional brush map owner'
  );
  assert.ok(
    identifier(expressionValue(optional.node, 'key'), 'brush'),
    'RSD optional brush key owner'
  );
  assertOptionalSwitch(optional.node, 'RSD optional brush switch');
  assert.equal(toolbarSwitches.length, 1, 'RSD optional toolbar switch count');
  assertToolbarSwitch(toolbarSwitches[0], 'RSD optional toolbar switch');
  const toolbarCondition = toolbarConditions[0];
  assert.ok(
    toolbarCondition?.type === 'BinaryExpression' &&
      toolbarCondition.operator === '===' &&
      toolbarCondition.left.type === 'MemberExpression' &&
      !toolbarCondition.left.computed &&
      brushControl(toolbarCondition.left.object) &&
      identifier(toolbarCondition.left.property, 'kind') &&
      toolbarCondition.right.type === 'StringLiteral' &&
      toolbarCondition.right.value === 'toggle',
    'RSD optional toolbar switch branch'
  );

  const settingsMounts = [];
  babel.traverse(parse('src/rsdDrawing/RsdSettingsRoute.tsx'), {
    JSXOpeningElement({ node }) {
      if (node.name.type === 'JSXIdentifier' && node.name.name === 'NativeSoundSettingsDialog')
        settingsMounts.push(node);
    },
  });
  assert.equal(settingsMounts.length, 1, 'RSD brush settings mount count');
  for (const [prop, property] of [
    ['brushState', 'brushPreferences'],
    ['onBrushAvailabilityChange', 'setBrushAvailable'],
    ['onRetryBrushSave', 'retryBrushSave'],
  ])
    assert.ok(
      namedMember(expressionValue(settingsMounts[0], prop), 'screen', property),
      'RSD brush settings mount owner: ' + prop
    );

  function assertTransformedBrushSwitches(ast, file) {
    if (
      file === 'src/rsdDrawing/RsdSettingsDialog.tsx' ||
      file === 'src/rsdDrawing/RsdActionsPanel.tsx'
    ) {
      const transformedSwitches = [];
      babel.traverse(ast, {
        ObjectExpression({ node }) {
          const selection = expressionValue(node, 'selection');
          if (selection?.type === 'StringLiteral' && selection.value === 'switch')
            transformedSwitches.push(node);
        },
      });
      if (file === 'src/rsdDrawing/RsdSettingsDialog.tsx') {
        assert.equal(transformedSwitches.length, 7, 'RSD transformed settings switch templates');
        const optional = transformedSwitches.filter((node) =>
          availabilityValue(expressionValue(node, 'selected'))
        );
        assert.equal(optional.length, 1, 'RSD transformed optional brush switch count');
        assertOptionalSwitch(optional[0], 'RSD transformed optional brush switch');
        assert.deepEqual(
          transformedSwitches
            .filter((node) => node !== optional[0])
            .map((node) => expressionValue(node, 'selected'))
            .map((node) =>
              [
                'soundEnabled',
                'coloringBookEnabled',
                'undoButtonEnabled',
                'strokeWidthControlEnabled',
                'saveOnDeleteEnabled',
                'pencilEraserEnabled',
              ].find((property) => settingsValue(node, property))
            )
            .sort(),
          [
            'coloringBookEnabled',
            'pencilEraserEnabled',
            'saveOnDeleteEnabled',
            'soundEnabled',
            'strokeWidthControlEnabled',
            'undoButtonEnabled',
          ],
          'RSD transformed settings switch state callers'
        );
      } else {
        assert.equal(
          transformedSwitches.length,
          1,
          'RSD transformed optional toolbar switch count'
        );
        assertToolbarSwitch(transformedSwitches[0], 'RSD transformed optional toolbar switch');
      }
    }
  }
  return { optionalBrushes, optionalLabels, assertTransformedBrushSwitches };
}

module.exports = { validateBrushSources };
