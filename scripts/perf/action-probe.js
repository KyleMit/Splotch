(() => {
  const frames = [];
  const canvasDescriptors = {
    width: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width'),
    height: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height'),
  };
  let previousFrameAt;
  let active = null;
  let actionSequence = 0;

  function canvasKind(canvas) {
    if (canvas.id === 'drawingCanvas') return 'input';
    if (canvas.hasAttribute('data-live-tile')) return 'normal-tile';
    if (canvas.hasAttribute('data-live-crayon-bottom')) return 'crayon-bottom';
    if (canvas.hasAttribute('data-live-crayon-top')) return 'crayon-top';
    return canvas.isConnected ? 'other-attached' : 'other-detached';
  }

  for (const property of ['width', 'height']) {
    const descriptor = canvasDescriptors[property];
    Object.defineProperty(HTMLCanvasElement.prototype, property, {
      ...descriptor,
      set(value) {
        if (active) {
          active.canvasMutations.push({
            at: performance.now(),
            kind: canvasKind(this),
            property,
            from: descriptor.get.call(this),
            to: Number(value),
          });
        }
        descriptor.set.call(this, value);
      },
    });
  }

  function frame(at) {
    if (previousFrameAt !== undefined) frames.push([at, at - previousFrameAt]);
    previousFrameAt = at;
    requestAnimationFrame(frame);
  }

  function removeListeners(action) {
    for (const { target, type, listener } of action.listeners) {
      target.removeEventListener(type, listener, true);
    }
    action.listeners.length = 0;
  }

  function begin(label, selector, eventTypes = ['pointerup', 'click']) {
    if (active) throw new Error(`Action ${active.label} is still active`);
    const target = document.querySelector(selector);
    if (!target) throw new Error(`No action target matches ${selector}`);
    const action = {
      label,
      traceName: `action:${label}:${++actionSequence}`,
      armedAt: performance.now(),
      actionAt: null,
      eventType: null,
      measureCount: performance.getEntriesByType('measure').length,
      canvasMutations: [],
      listeners: [],
    };
    const listener = (event) => {
      if (action.actionAt !== null) return;
      action.actionAt = performance.now();
      action.eventType = event.type;
      action.trusted = event.isTrusted;
      performance.mark(`${action.traceName}:start`);
    };
    for (const type of eventTypes) {
      target.addEventListener(type, listener, { capture: true });
      action.listeners.push({ target, type, listener });
    }
    active = action;
    return true;
  }

  function beginExternal(label, eventTypes) {
    if (active) throw new Error(`Action ${active.label} is still active`);
    const action = {
      label,
      traceName: `action:${label}:${++actionSequence}`,
      armedAt: performance.now(),
      actionAt: null,
      eventType: null,
      measureCount: performance.getEntriesByType('measure').length,
      canvasMutations: [],
      listeners: [],
    };
    const listener = (event) => {
      if (action.actionAt !== null) return;
      action.actionAt = performance.now();
      action.eventType = event.type;
      action.trusted = event.isTrusted;
      performance.mark(`${action.traceName}:start`);
    };
    for (const type of eventTypes) {
      window.addEventListener(type, listener, { capture: true });
      action.listeners.push({ target: window, type, listener });
    }
    active = action;
    return true;
  }

  function markExternalAction() {
    if (!active) throw new Error('No action is active');
    if (active.actionAt === null) {
      active.actionAt = performance.now();
      active.eventType = 'driver';
      performance.mark(`${active.traceName}:start`);
    }
  }

  function finish(readyAt = performance.now()) {
    if (!active) throw new Error('No action is active');
    const action = active;
    active = null;
    removeListeners(action);
    const actionAt = action.actionAt ?? action.armedAt;
    const finishedAt = performance.now();
    if (action.actionAt === null) performance.mark(`${action.traceName}:start`);
    performance.measure(action.traceName, `${action.traceName}:start`);
    const actionFrames = frames.filter(([at, gap]) => at >= actionAt && at - gap <= finishedAt);
    const firstFrame = actionFrames.find(([at]) => at >= actionAt);
    const topFrameGaps = actionFrames
      .map(([at, gap]) => ({
        gapMs: gap,
        startFromActionMs: at - gap - actionAt,
        endFromActionMs: at - actionAt,
      }))
      .sort((left, right) => right.gapMs - left.gapMs)
      .slice(0, 5);
    return {
      label: action.label,
      traceName: action.traceName,
      armedAt: action.armedAt,
      actionAt,
      eventType: action.eventType ?? 'uncaptured',
      trusted: action.trusted ?? null,
      readyMs: readyAt - actionAt,
      firstFrameMs: firstFrame ? firstFrame[0] - actionAt : null,
      frameGapsMs: actionFrames.map(([, gap]) => gap),
      postActionFrameGapsMs: actionFrames
        .filter(([at, gap]) => at - gap >= actionAt)
        .map(([, gap]) => gap),
      topFrameGaps,
      canvasMutations: action.canvasMutations.map(({ at, ...mutation }) => ({
        ...mutation,
        atFromActionMs: at - actionAt,
      })),
      measures: performance
        .getEntriesByType('measure')
        .slice(action.measureCount)
        .map(({ name, startTime, duration }) => ({
          name,
          startFromActionMs: startTime - actionAt,
          duration,
        })),
    };
  }

  window.__actionProbe = {
    begin,
    beginExternal,
    markExternalAction,
    finish,
  };
  requestAnimationFrame(frame);
})();
