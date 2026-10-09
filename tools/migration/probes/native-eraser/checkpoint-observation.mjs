function observationBase(protectedRegion) {
  const state = {
    mode: 'normal',
    retainAll: true,
    captures: [],
    retained: [],
    callbackPngs: [],
    causal: false,
    diagnosticLimits: { captures: 8, retainedBytes: 16 * 1024 * 1024, svgs: 32, fragments: 512 },
    events: [],
    delayed: [],
    maxMaskDepth: 0,
    maxImages: 0,
  };
  globalThis.__eraserCheckpointProbe = state;
  diagnosticStart(state);
  const nativeDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const data = nativeDataURL.apply(this, args);
    const cornerAlpha = this.getContext('2d')?.getImageData(0, 0, 1, 1).data[3];
    const record = {
      captureId: state.canvasCaptureIds.get(this) ?? null,
      heap: diagnosticHeap(),
      at: performance.now(),
      width: this.width,
      height: this.height,
      characters: data.length,
      cornerAlpha,
    };
    if (cornerAlpha === 0 && record.captureId)
      diagnosticAttempt(state, () => {
        const pixels = this.getContext('2d').getImageData(
          protectedRegion.left,
          protectedRegion.top,
          protectedRegion.width,
          protectedRegion.height
        );
        record.protectedRegion = protectedRegion;
        diagnosticHash(state, record, 'protectedRgbaSha256', pixels.data);
      });
    state.captures.push(record);
    if (cornerAlpha === 0) {
      if (state.retainAll) {
        if (state.retained.length < 8) state.retained.push(data);
      } else if (state.retained.length < 2) state.retained.push(data);
      else state.retained[1] = data;
    }
    return data;
  };
  const NativeImage = window.Image;
  window.Image = function (...args) {
    const image = new NativeImage(...args);
    image.addEventListener(
      'load',
      (event) => {
        if (state.mode === 'drop-next-svg-load' && image.src.startsWith('data:image/svg+xml')) {
          state.mode = 'normal';
          state.delayed.push({ image, callback: image.onload });
          state.events.push({ type: 'blocked-svg-load', at: performance.now() });
          event.stopImmediatePropagation();
          image.onload = null;
        }
      },
      true
    );
    return image;
  };
  window.Image.prototype = NativeImage.prototype;
  document.addEventListener(
    'load',
    (event) => {
      if (event.target instanceof SVGImageElement)
        state.events.push({
          type: 'checkpoint-image-load',
          at: performance.now(),
          characters: event.target.href.baseVal.length,
        });
    },
    true
  );
  new MutationObserver(() => {
    for (const node of document.querySelectorAll('[mask]')) {
      let depth = 0;
      for (let parent = node; parent; parent = parent.parentElement)
        depth += parent.hasAttribute('mask');
      state.maxMaskDepth = Math.max(state.maxMaskDepth, depth);
    }
    state.maxImages = Math.max(state.maxImages, document.querySelectorAll('svg image').length);
  }).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['mask'],
  });
}

function diagnosticHeap() {
  const memory = performance.memory;
  return memory
    ? { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit }
    : null;
}

function diagnosticAttempt(state, action) {
  try {
    return action();
  } catch (error) {
    state.diagnosticErrors.push(String(error));
  }
}

function diagnosticRetain(state, list, item, key) {
  const size = (value) => new TextEncoder().encode(value[key]).length;
  const bytes = list.reduce((sum, value) => sum + size(value), size(item));
  const { captures, retainedBytes } = state.diagnosticLimits;
  if (list.length >= captures || bytes > retainedBytes)
    throw new Error('Diagnostic retention limit');
  list.push(item);
}

function diagnosticHash(state, record, key, value) {
  const started = performance.now(),
    encoded = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  state.hashCost.bytes += encoded.length;
  state.jobs.push(
    crypto.subtle
      .digest('SHA-256', encoded)
      .then((bytes) => {
        state.hashCost.elapsedMs += performance.now() - started;
        record[key] = [...new Uint8Array(bytes)]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
      })
      .catch((error) => {
        record[key + 'Failure'] = String(error);
      })
  );
}

function diagnosticAttributes(node, excluded = []) {
  return Object.fromEntries(
    [...node.attributes]
      .filter((item) => !excluded.includes(item.name))
      .map((item) => [item.name, item.value])
  );
}

function diagnosticGeometry(node) {
  if (!node) return null;
  const style = getComputedStyle(node),
    rect = node.getBoundingClientRect();
  const matrix = (value) =>
    value ? { a: value.a, b: value.b, c: value.c, d: value.d, e: value.e, f: value.f } : null;
  return {
    attributes: diagnosticAttributes(node, ['href']),
    rect: rect.toJSON(),
    ctm: matrix(node.getCTM?.()),
    screenCTM: matrix(node.getScreenCTM?.()),
    css: {
      width: style.width,
      height: style.height,
      opacity: style.opacity,
      transform: style.transform,
      isolation: style.isolation,
      mixBlendMode: style.mixBlendMode,
      colorInterpolation: style.colorInterpolation,
    },
    pixelRatio: devicePixelRatio,
  };
}

function diagnosticScene(state, record, children) {
  const queue = [children];
  let inspected = 0;
  while (queue.length && inspected++ < 256) {
    const item = queue.pop();
    if (Array.isArray(item)) {
      queue.push(...item);
      continue;
    }
    if (!item?.props) continue;
    const name = item.type?.render?.name ?? item.type?.name;
    if (name === 'InkScene') {
      const { checkpoint, strokes } = item.props;
      record.scene = {
        checkpointId: checkpoint?.id ?? null,
        prefixLength: checkpoint?.strokes.length ?? 0,
        remainingLength: strokes.length,
      };
      diagnosticHash(state, record.scene, 'remainingJsonSha256', JSON.stringify(strokes));
      diagnosticHash(
        state,
        record.scene,
        'drawnOperationPrefixJsonSha256',
        JSON.stringify([...(checkpoint?.strokes ?? []), ...strokes])
      );
      diagnosticHash(
        state,
        record.scene,
        'prefixJsonSha256',
        JSON.stringify(checkpoint?.strokes ?? [])
      );
      if (checkpoint)
        diagnosticHash(state, record.scene, 'checkpointBase64TextSha256', checkpoint.base64);
      return;
    }
    queue.push(item.props.children);
  }
  record.sceneUnavailable = 'No named InkScene element found in actual Svg instance children';
}

function diagnosticAncestors(node) {
  const key = Object.getOwnPropertyNames(node).find((name) => name.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  const ancestors = [];
  for (let index = 0; fiber && index < 64; index++, fiber = fiber.return) {
    const name = fiber.type?.render?.name ?? fiber.type?.name ?? fiber.type;
    if (typeof name === 'string') ancestors.push({ name, key: fiber.key });
  }
  return ancestors;
}

function diagnosticOwner(node) {
  const ancestors = diagnosticAncestors(node),
    has = (name) => ancestors.some((item) => item.name === name);
  let kind = 'unknown';
  if (has('FixedInkCapture')) kind = has('PictureCapture') ? 'picture-ink' : 'checkpoint';
  else if (has('RasterFrames'))
    kind = node.firstElementChild?.getAttribute('opacity') === '0' ? 'incoming-ink' : 'live-ink';
  else if (has('PictureCapture')) kind = 'picture-output';
  return { kind, ancestors };
}

function diagnosticInstance(node) {
  const key = Object.getOwnPropertyNames(node).find((name) => name.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null,
    instance;
  for (let index = 0; fiber && index < 64; index++, fiber = fiber.return) {
    if (fiber.stateNode?.elementRef?.current === node) instance = fiber.stateNode;
  }
  return instance;
}

function diagnosticDocument(state) {
  const started = performance.now(),
    nodes = [...document.querySelectorAll('svg')];
  if (nodes.length > state.diagnosticLimits.svgs) throw new Error('Document SVG inventory limit');
  const owners = new Map(nodes.map((node, index) => [node, index]));
  let fragments = 0;
  const svgs = nodes.map((node, index) => {
    const elements = [
      node,
      ...node.querySelectorAll('[id], [fill], [stroke], [mask], [clip-path], [filter]'),
    ];
    const ids = elements.filter((item) => item.id).map((item) => item.id);
    const refs = elements.flatMap((item) =>
      [...item.attributes].flatMap((attr) =>
        [...attr.value.matchAll(/url\(#([^)]+)\)/g)].map((match) => {
          const resolved = document.getElementById(match[1]);
          return {
            tag: item.tagName,
            attribute: attr.name,
            id: match[1],
            resolvedSvg: resolved ? owners.get(resolved.closest('svg')) : null,
          };
        })
      )
    );
    fragments += ids.length + refs.length;
    if (fragments > state.diagnosticLimits.fragments)
      throw new Error('Document fragment inventory limit');
    return { index, geometry: diagnosticGeometry(node), ids, refs };
  });
  return { svgs, inventoryMs: performance.now() - started };
}

function diagnosticPatchSvg(state, node) {
  const instance = diagnosticInstance(node);
  if (!instance || typeof instance.toDataURL !== 'function') return;
  const prototype = Object.getPrototypeOf(instance);
  if (state.patched.has(prototype)) return;
  state.patched.add(prototype);
  const original = prototype.toDataURL;
  prototype.toDataURL = function (callback, options) {
    const target = this.elementRef.current,
      id = ++state.nextCaptureId;
    const record = { id, at: performance.now(), options };
    diagnosticAttempt(state, () => {
      Object.assign(record, {
        callStack: new Error().stack,
        livePaper: !!target?.closest('[data-testid="drawing-paper"]'),
        owner: diagnosticOwner(target),
        geometry: diagnosticGeometry(target),
        heap: diagnosticHeap(),
        ancestors: diagnosticAncestors(target),
        purpose: state.activePurpose ?? 'production',
        documentSvgs: state.causal ? diagnosticDocument(state) : null,
        magicSemantics: state.causal
          ? [...target.querySelectorAll('linearGradient')].map((gradient) => ({
              attributes: diagnosticAttributes(gradient, ['id']),
              stops: [...gradient.children].map((item) => diagnosticAttributes(item)),
              paths: [...target.querySelectorAll('path')]
                .filter((item) => item.getAttribute('stroke') === `url(#${gradient.id})`)
                .map((item) => diagnosticAttributes(item, ['stroke'])),
            }))
          : null,
      });
      record.images = [...target.querySelectorAll('image')].map((image) => {
        const item = { geometry: diagnosticGeometry(image) };
        diagnosticHash(state, item, 'hrefTextSha256', image.href.baseVal);
        return item;
      });
      diagnosticScene(state, record, this.props.children);
    });
    state.details.push(record);
    const previous = state.activeId;
    state.activeId = id;
    try {
      return original.call(
        this,
        (base64) => {
          record.callbackAt = performance.now();
          record.callbackCount = (record.callbackCount ?? 0) + 1;
          record.callbackBase64Characters = base64.length;
          if (state.causal)
            diagnosticAttempt(state, () =>
              diagnosticRetain(state, state.callbackPngs, { captureId: id, base64 }, 'base64')
            );
          diagnosticAttempt(state, () =>
            diagnosticHash(state, record, 'callbackBase64TextSha256', base64)
          );
          callback(base64);
        },
        options
      );
    } finally {
      state.activeId = previous;
    }
  };
}

function diagnosticCaptureLive() {
  const state = globalThis.__eraserCheckpointProbe;
  const nodes = [...document.querySelectorAll('[data-testid="drawing-paper"] svg')].filter(
    (item) => diagnosticOwner(item).kind === 'live-ink'
  );
  const instance = nodes.length === 1 ? diagnosticInstance(nodes[0]) : null;
  if (!instance) throw new Error('Missing unique production visible RasterFrames Svg instance');
  state.activePurpose = 'harness-direct-live-Svg.toDataURL';
  try {
    return new Promise((resolve) => instance.toDataURL(resolve, { width: 1024, height: 768 }));
  } finally {
    state.activePurpose = null;
  }
}

function diagnosticStart(state) {
  Object.assign(state, {
    activeId: null,
    captureLive: diagnosticCaptureLive,
    nextCaptureId: 0,
    details: [],
    diagnosticErrors: [],
    serialized: [],
    jobs: [],
    hashCost: { bytes: 0, elapsedMs: 0 },
    imageCaptureIds: new WeakMap(),
    canvasCaptureIds: new WeakMap(),
    patched: new WeakSet(),
    heap: diagnosticHeap,
  });
  const originalSerializer = XMLSerializer.prototype.serializeToString;
  XMLSerializer.prototype.serializeToString = function (node) {
    const started = performance.now(),
      text = originalSerializer.call(this, node),
      id = state.activeId;
    if (id) {
      diagnosticAttempt(state, () => {
        const record = state.details.find((item) => item.id === id);
        record.serializationMs = performance.now() - started;
        record.serializedCharacters = text.length;
        record.serializedInnerSvg = diagnosticGeometry(node.firstElementChild);
        record.serializedOuterAttributes = diagnosticAttributes(node);
        diagnosticHash(state, record, 'serializedSvgTextSha256', text);
        const item = { captureId: id, text };
        if (state.causal) diagnosticRetain(state, state.serialized, item, 'text');
        else if (state.serialized.length < 2) state.serialized.push(item);
        else state.serialized[1] = item;
      });
    }
    return text;
  };
  const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
    const id = state.imageCaptureIds.get(image);
    if (id) {
      diagnosticAttempt(state, () => {
        state.canvasCaptureIds.set(this.canvas, id);
        const record = state.details.find((item) => item.id === id);
        diagnosticHash(state, record, 'sourceImageUriTextSha256', image.src);
        record.drawImage = {
          sourceUriCharacters: image.src.length,
          args,
          imageWidth: image.width,
          imageHeight: image.height,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          imageSmoothingEnabled: this.imageSmoothingEnabled,
          imageSmoothingQuality: this.imageSmoothingQuality,
          contextAttributes: this.getContextAttributes?.(),
        };
      });
    }
    return originalDraw.call(this, image, ...args);
  };
  const NativeImage = window.Image;
  window.Image = function (...args) {
    const image = new NativeImage(...args);
    if (state.activeId) state.imageCaptureIds.set(image, state.activeId);
    return image;
  };
  window.Image.prototype = NativeImage.prototype;
  new MutationObserver(() => {
    for (const node of document.querySelectorAll('svg'))
      diagnosticAttempt(state, () => diagnosticPatchSvg(state, node));
  }).observe(document, { childList: true, subtree: true });
}

export async function installObservation(page, protectedRegion) {
  const functions = [
    diagnosticHeap,
    diagnosticAttempt,
    diagnosticHash,
    diagnosticRetain,
    diagnosticAncestors,
    diagnosticOwner,
    diagnosticInstance,
    diagnosticCaptureLive,
    diagnosticAttributes,
    diagnosticDocument,
    diagnosticGeometry,
    diagnosticScene,
    diagnosticPatchSvg,
    diagnosticStart,
    observationBase,
  ];
  await page.addInitScript(
    '(()=>{' +
      functions.map((fn) => fn.toString()).join('\n') +
      ';observationBase(' +
      JSON.stringify(protectedRegion) +
      ');})()'
  );
}

export async function retained(page) {
  return page.evaluate(async () => {
    const state = globalThis.__eraserCheckpointProbe;
    const started = performance.now();
    await Promise.all(state.jobs);
    const metadataJsonCharacters = JSON.stringify(state.details).length;
    if (state.causal && metadataJsonCharacters > 1024 * 1024)
      state.diagnosticErrors.push('Metadata retention byte limit');
    const retention = {
      serializedCharacters: state.serialized.reduce((sum, item) => sum + item.text.length, 0),
      base64Characters: state.retained.reduce((sum, item) => sum + item.length, 0),
      metadataJsonCharacters,
      hashCost: state.hashCost,
      hashSettlementMs: performance.now() - started,
      retainedSvgCount: state.serialized.length,
      retainedPngCount: state.retained.length,
      callbackBase64Characters: state.callbackPngs.reduce(
        (sum, item) => sum + item.base64.length,
        0
      ),
      diagnosticLimits: state.diagnosticLimits,
      hashJobs: state.jobs.length,
      heap: state.heap(),
    };
    return {
      captures: state.captures,
      retained: state.retained,
      callbackPngs: state.callbackPngs,
      events: state.events,
      maxMaskDepth: state.maxMaskDepth,
      maxImages: state.maxImages,
      details: state.details,
      diagnosticErrors: state.diagnosticErrors,
      serialized: state.serialized,
      retention,
    };
  });
}

export async function captureLive(page) {
  return page.evaluate(() => globalThis.__eraserCheckpointProbe.captureLive());
}
