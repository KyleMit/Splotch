(() => {
  const frames = [];
  let previousFrameAt;
  let active = null;

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
      armedAt: performance.now(),
      actionAt: null,
      eventType: null,
      listeners: [],
    };
    const listener = (event) => {
      if (action.actionAt !== null) return;
      action.actionAt = performance.now();
      action.eventType = event.type;
      action.trusted = event.isTrusted;
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
      armedAt: performance.now(),
      actionAt: null,
      eventType: null,
      listeners: [],
    };
    const listener = (event) => {
      if (action.actionAt !== null) return;
      action.actionAt = performance.now();
      action.eventType = event.type;
      action.trusted = event.isTrusted;
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
    }
  }

  function finish(readyAt = performance.now()) {
    if (!active) throw new Error('No action is active');
    const action = active;
    active = null;
    removeListeners(action);
    const actionAt = action.actionAt ?? action.armedAt;
    const finishedAt = performance.now();
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
      armedAt: action.armedAt,
      actionAt,
      eventType: action.eventType ?? 'uncaptured',
      trusted: action.trusted ?? null,
      readyMs: readyAt - actionAt,
      firstFrameMs: firstFrame ? firstFrame[0] - actionAt : null,
      frameGapsMs: actionFrames.map(([, gap]) => gap),
      topFrameGaps,
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
