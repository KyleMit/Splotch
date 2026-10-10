import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createInkObservationController } from '../../experiments/native-architecture/src/drawing/inkObservation.ts';

function fixture() {
  const dispose = vi.fn();
  let current = true;
  const context = { grid: { width: 2, height: 2 }, current: () => current, dispose };
  const decode = vi.fn(async () => true);
  const controller = createInkObservationController(() => context, decode);
  return {
    context,
    decode,
    dispose,
    controller,
    change: () => {
      current = false;
    },
  };
}

function findNode(root, predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  expect(matches).toHaveLength(1);
  return matches[0];
}

function initializer(root, name) {
  return findNode(
    root,
    (node) => ts.isVariableDeclaration(node) && node.name.getText() === name
  ).initializer.getText();
}

function admissionFixture(source) {
  const release = vi.fn();
  const lockInput = vi.fn(() => release);
  const operationWrites = vi.fn();
  let operation = null;
  const state = {
    scene: { current: { current: () => true } },
    command: { current: false },
    blocked: () => false,
    mounted: { current: true },
    operation: {
      get current() {
        return operation;
      },
      set current(next) {
        operationWrites(next);
        operation = next;
      },
    },
    surface: { current: { lockInput } },
    setBusy: vi.fn(),
    report: vi.fn(),
  };
  return { state, lockInput, release, operationWrites, run: runInNewContext(source, state) };
}

describe('owned ink observation request', () => {
  it('executes actual command admission before action, lock, token and busy effects', async () => {
    const caller = readFileSync(
      new URL('../../experiments/native-architecture/src/useDrawingScreen.ts', import.meta.url),
      'utf8'
    );
    const parsed = ts.createSourceFile('screen.ts', caller, ts.ScriptTarget.Latest, true);
    const declaration = findNode(
      parsed,
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'runCommand'
    );
    const source = ts.transpileModule(`(${declaration.getText()})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    for (const reject of [
      (state) => {
        state.scene.current.current = () => false;
      },
      (state) => {
        state.scene.current = null;
      },
      (state) => {
        state.command.current = true;
      },
      (state) => {
        state.blocked = () => true;
      },
    ]) {
      const f = admissionFixture(source);
      reject(f.state);
      const command = f.state.command.current;
      const action = vi.fn();
      await f.run(action);
      expect(action).not.toHaveBeenCalled();
      expect(f.lockInput).not.toHaveBeenCalled();
      expect(f.release).not.toHaveBeenCalled();
      expect(f.operationWrites).not.toHaveBeenCalled();
      expect(f.state.setBusy).not.toHaveBeenCalled();
      expect(f.state.report).not.toHaveBeenCalled();
      expect(f.state.command.current).toBe(command);
    }
    const f = admissionFixture(source);
    const action = vi.fn(async (current) => {
      expect(current()).toBe(true);
      expect(f.operationWrites).toHaveBeenCalledTimes(1);
      expect(f.state.command.current).toBe(true);
    });
    await f.run(action);
    expect(action).toHaveBeenCalledOnce();
    expect(f.lockInput).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.operationWrites).toHaveBeenCalledTimes(2);
    expect(f.operationWrites).toHaveBeenLastCalledWith(null);
    expect(f.state.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(f.state.command.current).toBe(false);
    expect(f.state.report).not.toHaveBeenCalled();
  });
  it('binds the exact prepared grid and current callback into the consumed decoder', async () => {
    const f = fixture(),
      request = f.controller.begin(() => true);
    await expect(request.observe('actual-png')).resolves.toBe(true);
    expect(f.decode).toHaveBeenCalledWith('actual-png', f.context.grid, expect.any(Function));
    expect(f.dispose).toHaveBeenCalledOnce();
  });
  it('abandons only pre-decode leases and refuses their late use', async () => {
    const f = fixture(),
      request = f.controller.begin(() => true);
    request.cancel();
    await expect(request.observe('late')).rejects.toThrow('changed');
    expect(f.decode).not.toHaveBeenCalled();
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.controller.begin(() => true)).toBeDefined();
  });
  it('retains an underlying decoder lease after cancellation until real finally', async () => {
    const f = fixture();
    let settle;
    f.decode.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        })
    );
    const request = f.controller.begin(() => true),
      pending = request.observe('png');
    const rejected = (async () => {
      await expect(pending).rejects.toThrow('changed');
    })();
    request.cancel();
    expect(() => f.controller.begin(() => true)).toThrow('not ready');
    expect(f.dispose).not.toHaveBeenCalled();
    settle(true);
    await rejected;
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.controller.begin(() => true)).toBeDefined();
  });
  it('refuses stale context, history and disposed-owner completion', async () => {
    const f = fixture(),
      request = f.controller.begin(() => true);
    f.change();
    await expect(request.observe('png')).rejects.toThrow('changed');
    expect(f.decode).not.toHaveBeenCalled();
    expect(() => f.controller.begin(() => false)).toThrow();
    f.controller.dispose();
    expect(() => f.controller.begin(() => true)).toThrow();
  });
  it('preserves failures without converting them into visual empty', async () => {
    const f = fixture();
    f.decode.mockRejectedValue(new Error('corrupt tail'));
    await expect(f.controller.begin(() => true).observe('png')).rejects.toThrow('corrupt tail');
    expect(f.dispose).toHaveBeenCalledOnce();
  });
  it('wires actual Clear preparation before capture and guards history/owner before commit', () => {
    const caller = readFileSync(
      new URL('../../experiments/native-architecture/src/useDrawingScreen.ts', import.meta.url),
      'utf8'
    );
    const parsed = ts.createSourceFile('screen.ts', caller, ts.ScriptTarget.Latest, true);
    const runCommand = findNode(
      parsed,
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'runCommand'
    );
    const clear = findNode(
      parsed,
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'clear'
    ).getText();
    expect(initializer(runCommand, 'lease')).toBe('scene.current');
    expect(initializer(runCommand, 'token')).toBe('{}');
    expect(runCommand.getText().indexOf('operation.current = token')).toBeGreaterThan(0);
    expect(runCommand.getText().indexOf('operation.current = token')).toBeLessThan(
      runCommand.getText().indexOf('await action(current)')
    );
    const state = {
      mounted: { current: true },
      lease: { current: () => true },
      token: {},
      operation: { current: null },
      command: { current: true },
      blocked: () => false,
      snapshot: {},
      owner: {},
      historyRef: { current: null },
      surface: { current: null },
    };
    state.operation.current = state.token;
    state.historyRef.current = state.snapshot;
    state.surface.current = state.owner;
    state.current = runInNewContext(initializer(runCommand, 'current'), state);
    const clearNode = findNode(
      parsed,
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'clear'
    );
    expect(clear).toContain('await runCommand(async (current) =>');
    expect(initializer(clearNode, 'snapshot')).toBe('historyRef.current');
    expect(initializer(clearNode, 'owner')).toBe('surface.current');
    const isCurrent = runInNewContext(initializer(clearNode, 'isCurrent'), state);
    expect(isCurrent()).toBe(true);
    for (const [target, key, obsolete] of [
      [state.mounted, 'current', false],
      [state.lease, 'current', () => false],
      [state.operation, 'current', {}],
      [state.command, 'current', false],
      [state, 'blocked', () => true],
      [state.historyRef, 'current', {}],
      [state.surface, 'current', {}],
    ]) {
      const original = target[key];
      target[key] = obsolete;
      expect(isCurrent()).toBe(false);
      target[key] = original;
      expect(isCurrent()).toBe(true);
    }
    expect(clear.indexOf('observations.current?.begin(isCurrent)')).toBeGreaterThan(0);
    expect(clear.indexOf('observations.current?.begin(isCurrent)')).toBeLessThan(
      clear.indexOf('await owner?.captureInk')
    );
    expect(clear.indexOf('if (!isCurrent())')).toBeGreaterThan(0);
    expect(clear.indexOf('if (!isCurrent())')).toBeLessThan(
      clear.indexOf('setHistory(clearDrawing(snapshot, empty))')
    );
    expect(clear).toContain('observation?.cancel()');
    const surface = readFileSync(
      new URL(
        '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx',
        import.meta.url
      ),
      'utf8'
    );
    expect(surface).toMatch(/useImperativeHandle\([\s\S]*?captureInk:[\s\S]*?\[\]\s*\)/);
  });
});
