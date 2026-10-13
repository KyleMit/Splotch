export function diagnosticAncestors(node) {
  const key = Object.getOwnPropertyNames(node).find((name) => name.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  const ancestors = [];
  for (let index = 0; fiber && index < 64; index++, fiber = fiber.return) {
    const name = fiber.type?.render?.name ?? fiber.type?.name ?? fiber.type;
    if (typeof name === 'string') ancestors.push({ name, key: fiber.key });
  }
  return ancestors;
}

export function diagnosticOwner(node) {
  const ancestors = diagnosticAncestors(node),
    has = (name) => ancestors.some((item) => item.name === name);
  let kind = 'unknown';
  if (has('FixedInkCapture')) kind = has('PictureCapture') ? 'picture-ink' : 'checkpoint';
  else if (has('RasterFrames'))
    kind = node.firstElementChild?.getAttribute('opacity') === '0' ? 'incoming-ink' : 'live-ink';
  else if (has('PictureCapture')) kind = 'picture-output';
  else if (has('DrawingSurface') && diagnosticPageOutline(diagnosticInstance(node)))
    kind = 'paper-outline';
  else if (has('ColoringPagePicker') && diagnosticPageOutline(diagnosticInstance(node)))
    kind = 'page-preview';
  return { kind, ancestors };
}

export function diagnosticPageOutline(instance) {
  const queue = [instance?.props?.children];
  let count = 0;
  while (queue.length && count++ < 256) {
    const item = queue.pop();
    if (Array.isArray(item)) queue.push(...item);
    else if (item?.type?.name === 'PageOutline') return true;
    else if (item?.props) queue.push(item.props.children);
  }
  return false;
}

export function classifyDiagnosticSvg(node, owner) {
  const progressbar = node.closest('[role="progressbar"]');
  const indicator = owner.ancestors.some((item) => item.name === 'ActivityIndicator');
  const paper = !!node.closest('[data-testid="drawing-paper"]');
  if (owner.kind === 'unknown' && indicator && progressbar && !paper)
    return { kind: 'noncapture-activity-indicator', owner, progressbar: true, paper: false };
  const requiredOwners = [
    'checkpoint',
    'picture-ink',
    'picture-output',
    'live-ink',
    'incoming-ink',
    'paper-outline',
    'page-preview',
  ];
  if (!requiredOwners.includes(owner.kind)) throw new Error('Unclassified document SVG owner');
  return { kind: 'required-capture', owner, progressbar: !!progressbar, paper };
}

export function assertObservationComplete(observation) {
  if (!Array.isArray(observation.diagnosticErrors) || observation.diagnosticErrors.length)
    throw new Error(
      'Mandatory SVG observation is incomplete: ' + JSON.stringify(observation.diagnosticErrors)
    );
}

export function diagnosticInstance(node) {
  const key = Object.getOwnPropertyNames(node).find((name) => name.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null,
    instance;
  for (let index = 0; fiber && index < 64; index++, fiber = fiber.return) {
    if (fiber.stateNode?.elementRef?.current === node) instance = fiber.stateNode;
  }
  return instance;
}
