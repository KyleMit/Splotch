import { node, center } from './android-run2-settings-helpers.mjs';
import { input, capture } from './android-driver.mjs';
export function visibleControl(xml, label, type, tag) {
  for (let i = 0; i < 8; i++) {
    try {
      const n = node(xml, label, type),
        [x, y] = center(n);
      if (y > 550 && y < 1850) return { xml, node: n, center: [x, y] };
    } catch {}
    input('swipe', 550, 1850, 550, 850, 450);
    xml = capture(`${tag}-scroll-${i}`);
  }
  throw new Error(`Control not reachable: ${label}`);
}
