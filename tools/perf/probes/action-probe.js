(() => {
  const frames = [];
  const canvasDescriptors = {
    width: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width'),
    height: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height'),
  };
  let previousFrameAt;
  let active = null;
  let actionSequence = 0;

  const VISUAL_EFFECT_START_EVENTS = ['transitionrun', 'animationstart'];
  const VISUAL_EFFECT_END_EVENTS = [
    'transitionend',
    'transitioncancel',
    'animationend',
    'animationcancel',
  ];
  const WINDOW_ACTIVITY_EVENTS = ['resize', 'orientationchange'];

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
    if (previousFrameAt !== undefined) {
      frames.push([at, at - previousFrameAt, (active?.visualEffectCount ?? 0) > 0]);
    }
    previousFrameAt = at;
    requestAnimationFrame(frame);
  }

  function nodeDescriptor(node) {
    if (!node) return null;
    const name = node.localName ?? node.nodeName?.toLowerCase() ?? 'unknown';
    const id = node.id ? `#${node.id}` : '';
    const classes =
      typeof node.className === 'string'
        ? node.className
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .map((className) => `.${className}`)
            .join('')
        : '';
    return `${name}${id}${classes}`;
  }

  function recordActivity(action, type, details = {}) {
    action.activities.push({ at: performance.now(), type, ...details });
  }

  function visualEffectDetails(event) {
    return {
      target: nodeDescriptor(event.target),
      ...(event.propertyName ? { property: event.propertyName } : {}),
      ...(event.animationName ? { animation: event.animationName } : {}),
      ...(event.pseudoElement ? { pseudoElement: event.pseudoElement } : {}),
    };
  }

  function visualEffectKey(event) {
    const kind = event.type.startsWith('transition') ? 'transition' : 'animation';
    return `${kind}:${event.propertyName ?? event.animationName ?? ''}:${event.pseudoElement ?? ''}`;
  }

  function startVisualEffect(action, event) {
    const effects = action.visualEffects.get(event.target) ?? new Set();
    const key = visualEffectKey(event);
    if (!effects.has(key)) {
      effects.add(key);
      action.visualEffects.set(event.target, effects);
      action.visualEffectCount++;
    }
    recordActivity(action, event.type, visualEffectDetails(event));
  }

  function endVisualEffect(action, event) {
    const effects = action.visualEffects.get(event.target);
    const key = visualEffectKey(event);
    if (effects?.delete(key)) {
      action.visualEffectCount = Math.max(0, action.visualEffectCount - 1);
      if (effects.size === 0) action.visualEffects.delete(event.target);
    }
    recordActivity(action, event.type, visualEffectDetails(event));
  }

  function closeDetachedVisualEffects(action) {
    for (const [target, effects] of action.visualEffects) {
      if (target?.isConnected !== false) continue;
      action.visualEffectCount = Math.max(0, action.visualEffectCount - effects.size);
      action.visualEffects.delete(target);
      recordActivity(action, 'visual-effect-detached', {
        target: nodeDescriptor(target),
        effects: [...effects],
      });
    }
  }

  function mutationDetails(records) {
    const targets = [...new Set(records.map((record) => nodeDescriptor(record.target)))].filter(
      Boolean
    );
    const added = [
      ...new Set(
        records.flatMap((record) => [...record.addedNodes].map((node) => nodeDescriptor(node)))
      ),
    ].filter(Boolean);
    const removed = [
      ...new Set(
        records.flatMap((record) => [...record.removedNodes].map((node) => nodeDescriptor(node)))
      ),
    ].filter(Boolean);
    return {
      targets: targets.slice(0, 8),
      ...(added.length ? { added: added.slice(0, 8) } : {}),
      ...(removed.length ? { removed: removed.slice(0, 8) } : {}),
    };
  }

  function recordMutations(action, records) {
    if (!records.length) return;
    recordActivity(action, 'dom-mutation', mutationDetails(records));
    closeDetachedVisualEffects(action);
  }

  function trackActivity(action) {
    action.mutationObserver = new MutationObserver((records) => {
      recordMutations(action, records);
    });
    action.mutationObserver.observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    const visualEffectStarted = (event) => startVisualEffect(action, event);
    const visualEffectEnded = (event) => endVisualEffect(action, event);
    const windowActivity = (event) => recordActivity(action, event.type);
    for (const type of VISUAL_EFFECT_START_EVENTS) {
      document.addEventListener(type, visualEffectStarted, true);
      action.listeners.push({ target: document, type, listener: visualEffectStarted });
    }
    for (const type of VISUAL_EFFECT_END_EVENTS) {
      document.addEventListener(type, visualEffectEnded, true);
      action.listeners.push({ target: document, type, listener: visualEffectEnded });
    }
    for (const type of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(type, windowActivity, true);
      action.listeners.push({ target: window, type, listener: windowActivity });
    }
    // The engine keys its paper view off the Screen Orientation API, whose
    // `change` event is a different target from window `orientationchange` —
    // without this the one rotation signal the app actually consumes would be
    // invisible in the diagnostics ADR-0142 points at.
    const screenOrientation = window.screen?.orientation;
    if (screenOrientation?.addEventListener) {
      const listener = () => recordActivity(action, 'screen-orientation-change');
      screenOrientation.addEventListener('change', listener, true);
      action.listeners.push({ target: screenOrientation, type: 'change', listener });
    }
  }

  function stopActivityTracking(action) {
    recordMutations(action, action.mutationObserver.takeRecords());
    action.mutationObserver.disconnect();
    removeListeners(action);
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
      activities: [],
      visualEffectCount: 0,
      visualEffects: new Map(),
      mutationObserver: null,
      listeners: [],
    };
    const listener = (event) => {
      // The timestamp is captured before the diagnostic recording so the
      // recording's forced hit-test cannot shift the action's measured origin
      // — its cost lands inside the measured window, visible rather than
      // silently subtracted from every latency this action reports.
      const at = performance.now();
      if (action.actionAt === null) {
        action.actionAt = at;
        action.eventType = event.type;
        action.trusted = event.isTrusted;
        performance.mark(`${action.traceName}:start`);
      }
      recordArmedEvent(action, event, at);
    };
    for (const type of eventTypes) {
      target.addEventListener(type, listener, { capture: true });
      action.listeners.push({ target, type, listener });
    }
    trackActivity(action);
    active = action;
    return true;
  }

  // Diagnosing a dead tap needs every armed event, not only the first that
  // stamps the action; a press whose down and up both target the control can
  // still die in a handler that re-hit-tests, and only per-event coordinates
  // say why. Capped so a pathological event storm cannot grow the artifact.
  const ARMED_EVENT_RECORD_CAP = 8;
  // Hit-tested only for the discrete tap events: elementFromPoint forces a
  // style/layout flush, which must not run per-event inside a measured scroll
  // (the wheel transport arms 'wheel' and every one would pay it).
  const HIT_TESTED_ARMED_EVENTS = new Set(['pointerdown', 'pointerup', 'click']);

  function recordArmedEvent(action, event, at) {
    if (!action.armedEvents) action.armedEvents = [];
    if (action.armedEvents.length >= ARMED_EVENT_RECORD_CAP) return;
    const hit =
      HIT_TESTED_ARMED_EVENTS.has(event.type) &&
      Number.isFinite(event.clientX) &&
      document.elementFromPoint(event.clientX, event.clientY);
    action.armedEvents.push({
      type: event.type,
      atFromArmMs: at - action.armedAt,
      x: event.clientX,
      y: event.clientY,
      trusted: event.isTrusted,
      hit: hit ? hit.id || hit.tagName : null,
    });
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
      activities: [],
      visualEffectCount: 0,
      visualEffects: new Map(),
      mutationObserver: null,
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
    trackActivity(action);
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
    stopActivityTracking(action);
    const actionAt = action.actionAt ?? action.armedAt;
    const finishedAt = performance.now();
    if (action.actionAt === null) performance.mark(`${action.traceName}:start`);
    performance.measure(action.traceName, `${action.traceName}:start`);
    const actionFrames = frames.filter(([at, gap]) => at >= actionAt && at - gap <= finishedAt);
    const responseEndedAt = Number.isFinite(readyAt) ? readyAt : finishedAt;
    const responseFrames = actionFrames.filter(([at, gap]) => at - gap <= responseEndedAt);
    const settleFrames = actionFrames.filter(([at, gap]) => at - gap > responseEndedAt);
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
      armedEvents: action.armedEvents ?? [],
      armedAt: action.armedAt,
      actionAt,
      eventType: action.eventType ?? 'uncaptured',
      trusted: action.trusted ?? null,
      readyMs: Number.isFinite(readyAt) ? readyAt - actionAt : null,
      firstFrameMs: firstFrame ? firstFrame[0] - actionAt : null,
      frameGapsMs: responseFrames.map(([, gap]) => gap),
      settleFrameGapsMs: settleFrames.map(([, gap]) => gap),
      postActionFrameGapsMs: actionFrames
        .filter(([at, gap]) => at - gap >= actionAt)
        .map(([, gap]) => gap),
      postActionFrames: actionFrames
        .filter(([at, gap]) => at - gap >= actionAt)
        .map(([at, gap, visualEffectsActive]) => ({
          gapMs: gap,
          startFromActionMs: at - gap - actionAt,
          endFromActionMs: at - actionAt,
          visualEffectsActive,
        })),
      topFrameGaps,
      activities: action.activities.map(({ at, ...activity }) => ({
        ...activity,
        atFromActionMs: at - actionAt,
      })),
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
