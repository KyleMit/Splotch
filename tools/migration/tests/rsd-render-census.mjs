// Counts which components ran their render function in each commit, the signal React DevTools'
// Profiler calls "rendered": a <Profiler> reports that its subtree committed, never which
// components inside it ran. React reports every commit to the DevTools hook it finds while
// react-dom loads, so a test imports this module before anything that loads react-dom.
//
// A fiber whose parent bailed out keeps its children's fibers from the last commit; one that was
// re-entered carries React's PerformedWork flag only if its function ran this time. Walking the
// committed tree beside its alternate, as DevTools does, therefore counts exactly the components
// React executed. rsd-native-render-budgets.test.mjs holds a positive control for each counter, so
// a React that stops reporting fails there rather than reading every budget as met.

const FUNCTION_COMPONENT = 0;
const CLASS_COMPONENT = 1;
const FORWARD_REF = 11;
const SIMPLE_MEMO_COMPONENT = 15;
const COMPONENT_TAGS = new Set([
  FUNCTION_COMPONENT,
  CLASS_COMPONENT,
  FORWARD_REF,
  SIMPLE_MEMO_COMPONENT,
]);
const PERFORMED_WORK = 1;

const renders = new Map();
let commits = 0;

function componentName({ type }) {
  if (typeof type === 'function') return type.displayName || type.name || null;
  if (type?.render) return type.displayName || type.render.displayName || type.render.name || null;
  if (type?.type) return type.displayName || type.type.displayName || type.type.name || null;
  return null;
}

function record(fiber) {
  if (!COMPONENT_TAGS.has(fiber.tag)) return;
  const name = componentName(fiber);
  if (name) renders.set(name, (renders.get(name) ?? 0) + 1);
}

function recordMount(fiber) {
  for (let node = fiber; node; node = node.sibling) {
    record(node);
    if (node.child) recordMount(node.child);
  }
}

function recordUpdate(next, previous) {
  if ((next.flags & PERFORMED_WORK) !== 0) record(next);
  if (next.child === previous.child) return;
  for (let child = next.child; child; child = child.sibling) {
    if (child.alternate) recordUpdate(child, child.alternate);
    else {
      record(child);
      if (child.child) recordMount(child.child);
    }
  }
}

globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  isDisabled: false,
  supportsFiber: true,
  renderers: new Map(),
  inject: () => 1,
  onScheduleFiberRoot() {},
  onCommitFiberRoot(_renderer, root) {
    commits += 1;
    const { current } = root;
    if (current.alternate) recordUpdate(current, current.alternate);
    else recordMount(current);
  },
  onCommitFiberUnmount() {},
  onPostCommitFiberRoot() {},
  checkDCE() {},
};

// Renders per component name since the last call, and the commits they came in.
export function takeRenders() {
  const taken = { commits, renders: Object.fromEntries(renders) };
  renders.clear();
  commits = 0;
  return taken;
}
