// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { act, createElement, forwardRef, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';

const native = vi.hoisted(() => ({
  handlers: null,
  layout: null,
  width: 1024,
  height: 768,
  owners: new WeakMap(),
}));

vi.mock('react-native', () => ({
  findNodeHandle: (target) => {
    const value = typeof target === 'number' ? target : native.owners.get(target);
    if (value instanceof Error) throw value;
    return value;
  },
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles },
  View: forwardRef(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        callback(0, 0, native.width, native.height, 40, 800);
      },
    }));
    if (onLayout) native.layout = onLayout;
    return createElement('div', null, children);
  }),
}));

vi.mock('react-native-svg', () => ({
  default: forwardRef(({ children }, ref) => createElement('div', { ref }, children)),
  Rect: () => null,
  Circle: ({ cx, cy }) => createElement('span', { 'data-ink': `${cx},${cy}` }),
  Path: ({ d }) => createElement('span', { 'data-ink': d }),
}));

const PAPER_TARGET = 101;

function touch(identifier, x, y, timestamp = 100) {
  return {
    identifier,
    locationX: x,
    locationY: y,
    pageX: x + 40,
    pageY: y + 800,
    target: PAPER_TARGET,
    timestamp,
  };
}

function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const item of [...touches, ...changedTouches]) {
    touchBank[item.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === item.identifier),
      startTimeStamp: starts[item.identifier] ?? item.timestamp,
      startPageX: item.pageX,
      startPageY: item.pageY,
      currentPageX: item.pageX,
      currentPageY: item.pageY,
      currentTimeStamp: item.timestamp,
      previousPageX: item.pageX,
      previousPageY: item.pageY,
      previousTimeStamp: item.timestamp,
    };
  }
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank,
      numberActiveTouches: touches.length,
      indexOfSingleActiveTouch: touches[0]?.identifier ?? -1,
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}

let root;
let container;
let props;

function send(callback, input, followStart = true) {
  act(() => {
    native.handlers[callback](input);
    if (
      followStart &&
      callback === 'onPanResponderGrant' &&
      input.nativeEvent.changedTouches.some(
        (touch) =>
          input.touchHistory?.touchBank?.[touch.identifier]?.startTimeStamp === touch.timestamp
      )
    )
      native.handlers.onPanResponderStart(input);
  });
}

function layout(width = 1024, height = 768) {
  native.width = width;
  native.height = height;
  act(() => native.layout({ nativeEvent: { layout: { width, height } } }));
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.width = 1024;
  native.height = 768;
  native.handlers = null;
  native.layout = null;
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
  props = {
    drawing: emptyDrawing(),
    currentDrawing: () => props.drawing,
    color: 'Purple',
    brush: 'marker',
    disabled: false,
    onCohort: vi.fn(),
    onDrawingChange: vi.fn(),
    onError: vi.fn(),
  };
  act(() => root.render(createElement(DrawingSurface, props)));
  layout();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function assertPlainTextTopology(program, sourcePath) {
  const source = program.getSourceFile(sourcePath);
  if (!source) throw new Error('Missing candidate source');
  const checker = program.getTypeChecker();
  const textNames = new Set(['Text']);
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'react-native'
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === 'Text')
          textNames.add(binding.name.text);
      }
  }
  function raw(type) {
    return type.isUnion()
      ? type.types.every(raw)
      : Boolean(type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike));
  }
  function visit(node) {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null;
    if (opening && textNames.has(opening.tagName.getText(source))) {
      for (const attribute of opening.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute))
          throw new Error('Emitter partition requires raw Text children');
        if (
          attribute.name.getText(source) === 'children' &&
          attribute.initializer &&
          !(
            ts.isStringLiteral(attribute.initializer) ||
            (ts.isJsxExpression(attribute.initializer) &&
              attribute.initializer.expression &&
              raw(checker.getTypeAtLocation(attribute.initializer.expression)))
          )
        )
          throw new Error('Emitter partition requires raw Text children');
      }
      for (const child of ts.isJsxElement(node) ? node.children : []) {
        if (ts.isJsxText(child)) continue;
        if (
          ts.isJsxExpression(child) &&
          (!child.expression || raw(checker.getTypeAtLocation(child.expression)))
        )
          continue;
        throw new Error('Emitter partition requires raw Text children');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function topologyFixture(text) {
  const sourcePath = '/splotch-emitter-topology-fixture.tsx';
  const options = { noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (path) =>
    path === sourcePath
      ? ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      : undefined;
  return () => assertPlainTextTopology(ts.createProgram([sourcePath], options, host), sourcePath);
}

function ios(touches, changed, owned, starts = {}) {
  const result = event(touches, changed, starts);
  result.nativeEvent.targetTouches = owned;
  result.nativeEvent.target = changed[0].target;
  return result;
}

function cleanup(kind) {
  if (kind === 'Terminate') send('onPanResponderTerminate');
  else if (kind === 'Resize') layout(512, 384);
  else act(() => root.render(null));
}

describe('mounted copied cleanup and native emitter batches', () => {
  it.each(['Terminate', 'Resize', 'Unmount'])(
    'consumes a proven suppressed-Move survivor exactly once at %s in old geometry',
    (kind) => {
      send('onPanResponderGrant', event([touch(0, 10, 20)]));
      send('onPanResponderMove', event([touch(0, 30, 40, 200)], undefined, { 0: 100 }));
      const regrant = event([touch(0, 50, 60, 300)], undefined, { 0: 100 });
      send('onPanResponderGrant', regrant, false);
      regrant.nativeEvent.touches[0].locationX = 999;
      regrant.nativeEvent.touches[0].pageX = 1039;
      cleanup(kind);
      send('onPanResponderTerminate');
      expect(props.onCohort).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0][0].points).toEqual([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 60 },
      ]);
    }
  );

  it.each(['Terminate', 'Resize', 'Unmount'])(
    'discards an ambiguous same-stamp reused Grant copy at %s',
    (kind) => {
      send('onPanResponderGrant', event([touch(0, 10, 20)]));
      send('onPanResponderGrant', event([touch(0, 100, 200)]), false);
      cleanup(kind);
      expect(props.onCohort).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
    }
  );

  it.each([false, true])(
    'deduplicates distinct iOS emitter payloads with a survivor, reverse order %s',
    (reverse) => {
      send('onPanResponderGrant', event([touch(0, 10, 20)]));
      const a = touch(0, 10, 20, 100);
      const b = touch(1, 30, 40, 200);
      const c = { ...touch(2, -50, 900, 200), target: 202 };
      const groups = reverse ? [[c], [a, b]] : [[a, b], [c]];
      for (const owned of groups)
        send('onPanResponderStart', ios([a, b, c], [b, c], owned, { 0: 100 }));
      send(
        'onPanResponderEnd',
        event([], [touch(0, 50, 60, 300), touch(1, 70, 80, 300), { ...c, timestamp: 300 }], {
          0: 100,
          1: 200,
          2: 200,
        })
      );
      expect(props.onCohort).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
      expect(props.onCohort.mock.calls[0][0][1].points).toEqual([
        { x: 30, y: 40 },
        { x: 70, y: 80 },
      ]);
      expect(props.onError).not.toHaveBeenCalled();
    }
  );

  it('uses actual paper currentTarget when the initial first changed touch belongs to a control', () => {
    const control = { ...touch(0, -50, 900, 201), target: 202 };
    const a = touch(1, 30, 40, 200);
    const b = touch(2, 50, 60, 202);
    const first = ios([control, a, b], [control, a, b], [control]);
    first.touchHistory.mostRecentTimeStamp = 200;
    send('onPanResponderGrant', first, false);
    send('onPanResponderStart', first);
    const second = ios([b, a, control], [b, control, a], [a, b]);
    second.touchHistory.mostRecentTimeStamp = 200;
    send('onPanResponderStart', second);
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0].map(({ points }) => points)).toEqual([
      [{ x: 30, y: 40 }],
      [{ x: 50, y: 60 }],
    ]);
  });

  it('does not apply iOS batch deduplication to real Android same-ms Start reuse', () => {
    const a = touch(0, 10, 20);
    send('onPanResponderGrant', event([a]));
    send('onPanResponderStart', event([touch(0, 100, 200)]));
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls.map(([strokes]) => strokes[0].points)).toEqual([
      [{ x: 10, y: 20 }],
      [{ x: 100, y: 200 }],
    ]);
  });

  it.each([null, {}, [], [{ identifier: 0 }]])(
    'fails closed on a present invalid iOS marker %j and retains its ignored origin',
    (marker) => {
      const first = event([touch(0, 10, 20)]);
      first.nativeEvent.targetTouches = marker;
      send('onPanResponderGrant', first, false);
      send('onPanResponderStart', first);
      const fresh = touch(0, 30, 40, 200);
      send('onPanResponderStart', ios([fresh], [fresh], [fresh]));
      send('onPanResponderTerminate');
      expect(props.onCohort).not.toHaveBeenCalled();
      expect(props.onError).toHaveBeenCalledTimes(1);
    }
  );

  it('fails closed on a duplicate emitter while coverage remains incomplete and resets at a delivered Move', () => {
    const a = touch(0, 10, 20);
    const c = { ...touch(1, -50, 900), target: 202 };
    send('onPanResponderGrant', ios([a, c], [a, c], [a]));
    send('onPanResponderStart', ios([a, c], [a, c], [a]));
    send('onPanResponderMove', event([a, c]));
    send('onPanResponderEnd', event([], [a, c]));
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(1);
    expect(props.onError).toHaveBeenCalledTimes(1);
    send('onPanResponderGrant', event([touch(0, 50, 60, 200)]));
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(2);
  });
  it('closes missing emitter coverage at End before a fresh same-stamp iOS gesture', () => {
    const a = touch(0, 10, 20);
    const c = { ...touch(1, -50, 900), target: 202 };
    send('onPanResponderGrant', ios([a, c], [a, c], [a]));
    send('onPanResponderEnd', event([], [a, c]));
    const fresh = touch(0, 100, 200);
    send('onPanResponderGrant', ios([fresh], [fresh], [fresh]));
    send('onPanResponderTerminate');
    expect(props.onCohort).toHaveBeenCalledTimes(2);
    expect(props.onCohort.mock.calls[1][0][0].points).toEqual([{ x: 100, y: 200 }]);
    expect(props.onError).not.toHaveBeenCalled();
  });

  it('rejects marker coordinates that do not match the complete current contact content', () => {
    const a = touch(0, 10, 20);
    const first = ios([a], [a], [{ ...a, locationX: 999 }]);
    send('onPanResponderGrant', first);
    send('onPanResponderTerminate');
    expect(props.onCohort).not.toHaveBeenCalled();
    expect(props.onError).toHaveBeenCalledTimes(1);
  });

  it('fails closed when native paper currentTarget cannot resolve a host tag', () => {
    const first = event([touch(0, 10, 20)]);
    first.currentTarget = null;
    send('onPanResponderGrant', first);
    send('onPanResponderTerminate');
    expect(props.onCohort).not.toHaveBeenCalled();
  });

  it('pins raw production Text children and paper box-only hit testing with rejecting controls', () => {
    const candidate = join(import.meta.dirname, '..', '..', 'experiments', 'native-architecture');
    const configPath = join(candidate, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, candidate);
    const screenPath = join(candidate, 'src', 'DrawingScreen.tsx');
    expect(() =>
      assertPlainTextTopology(ts.createProgram(parsed.fileNames, parsed.options), screenPath)
    ).not.toThrow();
    const surface = readFileSync(join(candidate, 'src', 'drawing', 'DrawingSurface.tsx'), 'utf8');
    expect(surface).toMatch(/testID="drawing-paper"\s+pointerEvents="box-only"/);
    expect(topologyFixture("const label = 'raw'; const x = <Text>{label}</Text>;")).not.toThrow();
    expect(topologyFixture('const x = <Text><Text>nested</Text></Text>;')).toThrow(
      'raw Text children'
    );
    expect(
      topologyFixture("const child = { type: 'button' }; const x = <Text>{child}</Text>;")
    ).toThrow('raw Text children');
    expect(topologyFixture('const child: unknown = null; const x = <Text>{child}</Text>;')).toThrow(
      'raw Text children'
    );
    expect(
      topologyFixture("const child = { type: 'button' }; const x = <Text children={child} />;")
    ).toThrow('raw Text children');
    expect(
      topologyFixture(
        'const props = { children: <Text>nested</Text> }; const x = <Text {...props} />;'
      )
    ).toThrow('raw Text children');
  });

  it.each(['incomplete', 'mixed'])(
    'rejects a present %s emitter partition before admitting new ink',
    (kind) => {
      send('onPanResponderGrant', event([touch(0, 10, 20)]));
      const a = touch(0, 10, 20);
      const b = touch(1, 30, 40, 200);
      const c = { ...touch(2, -50, 900, 200), target: 202 };
      send(
        'onPanResponderStart',
        ios([a, b, c], [b, c], kind === 'incomplete' ? [b] : [a, b, c], { 0: 100 })
      );
      send('onPanResponderTerminate');
      expect(props.onError).toHaveBeenCalledTimes(1);
      expect(props.onCohort.mock.calls[0][0]).toHaveLength(1);
      expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
    }
  );

  it('rejects partial overlap with any prior emitter contact while preserving already accepted ink', () => {
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    const a = touch(0, 10, 20);
    const b = touch(1, 30, 40, 200);
    const c = { ...touch(2, -50, 900, 200), target: 202 };
    send('onPanResponderStart', ios([a, b, c], [b, c], [a, b], { 0: 100 }));
    send('onPanResponderStart', ios([a, b, c], [b, c], [b, c], { 0: 100 }));
    send('onPanResponderTerminate');
    expect(props.onError).toHaveBeenCalledTimes(1);
    expect(props.onCohort).toHaveBeenCalledTimes(1);
    expect(props.onCohort.mock.calls[0][0]).toHaveLength(2);
  });
  it('resolves an opaque native public paper instance through the supported resolver', () => {
    const owner = {};
    native.owners.set(owner, PAPER_TARGET);
    const first = event([touch(0, 10, 20)]);
    first.currentTarget = owner;
    send('onPanResponderGrant', first);
    send('onPanResponderTerminate');
    expect(props.onCohort.mock.calls[0][0][0].points).toEqual([{ x: 10, y: 20 }]);
  });

  it.each([{}, 'paper', 0, -1, NaN])(
    'fails closed when native owner resolution cannot produce a tag from %j',
    (owner) => {
      const first = event([touch(0, 10, 20)]);
      first.currentTarget = owner;
      send('onPanResponderGrant', first);
      send('onPanResponderTerminate');
      expect(props.onCohort).not.toHaveBeenCalled();
    }
  );
  it.each([null, 0, -1, NaN, Infinity, new Error('unresolved host')])(
    'fails closed when the native resolver returns or throws %j',
    (result) => {
      const owner = {};
      native.owners.set(owner, result);
      const first = event([touch(0, 10, 20)]);
      first.currentTarget = owner;
      send('onPanResponderGrant', first);
      send('onPanResponderTerminate');
      expect(props.onCohort).not.toHaveBeenCalled();
    }
  );
});
