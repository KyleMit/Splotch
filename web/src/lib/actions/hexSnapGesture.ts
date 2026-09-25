import { HEX_GRID_GEOMETRY } from '$lib/design/trimGeometry';
import { capturePointer } from './pointerCapture';

interface HexCenter {
  color: string;
  cx: number;
  cy: number;
}

interface HexSnapCallbacks {
  hover: (color: string | null) => void;
  pick: (color: string) => void;
}

// A pointed Apple Pencil tip often lands in the clip-path gap between
// hexagons, where an element hit-test sees only the picker background. Snap
// to the nearest hexagon center within a radius of half the hexagon height
// plus this slop, so gap hits still resolve — for the pointerdown that starts
// the gesture (a tap in a gap otherwise selects nothing at all), the hover
// highlight while dragging, and the committed color alike. The slop bridges
// the gaps, and reaching half the height means nearest-center also covers
// direct hits without a DOM hit-test — which the drag path has no way to run
// anyway, since pointer capture retargets every move to the picker. Centers
// are snapshotted once per drag: per-move rect reads after each hover-class
// flip forced a reflow per hexagon per pointer event.
const HEX_SNAP_GAP_SLOP_PX = 5.5;

// Handlers are wired through the component's event attributes rather than an
// action's native listeners: they stop propagation, and Svelte's delegated
// dispatch keeps the dialog's own bubbling listeners (scribbleGuard) seeing
// every picker pointerdown before that stop takes effect.
export function createHexSnapGesture({ hover, pick }: HexSnapCallbacks) {
  let picker: HTMLElement | null = null;
  let isTrackingDrag = false;
  let highlighted: string | null = null;
  let hexCenters: HexCenter[] | null = null;
  // Measured from the live grid rather than fixed at the base geometry: roomy
  // viewports scale the honeycomb up (see --hex-scale), and a radius pinned to
  // an unscaled hexagon stops reaching a scaled one's ends.
  let hexSnapRadiusPx = HEX_GRID_GEOMETRY.firstRowPx / 2 + HEX_SNAP_GAP_SLOP_PX;

  function highlight(color: string | null) {
    highlighted = color;
    hover(color);
  }

  function snapshotHexCenters() {
    const centers: HexCenter[] = [];
    if (!picker) return centers;
    for (const hex of picker.querySelectorAll<HTMLElement>('.hexagon')) {
      const color = hex.dataset.color;
      if (!color) continue;
      const rect = hex.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (centers.length === 0) hexSnapRadiusPx = rect.height / 2 + HEX_SNAP_GAP_SLOP_PX;
      centers.push({ color, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    }
    return centers;
  }

  function findHexagonInPicker(x: number, y: number): string | null {
    hexCenters ??= snapshotHexCenters();
    let nearest: string | null = null;
    let nearestDistance = hexSnapRadiusPx;
    for (const { color, cx, cy } of hexCenters) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = color;
      }
    }
    return nearest;
  }

  function reset() {
    isTrackingDrag = false;
    highlight(null);
  }

  return {
    down(e: PointerEvent) {
      if (!(e.currentTarget instanceof HTMLElement)) return;
      picker = e.currentTarget;
      // Re-snapshotted per gesture rather than lazily: the picker can reopen from a
      // new origin, and a snapshot kept across that would snap to stale centers.
      hexCenters = snapshotHexCenters();
      const direct = e.target instanceof Element ? e.target.closest('.hexagon') : null;
      const color =
        (direct instanceof HTMLElement ? direct.dataset.color : undefined) ??
        findHexagonInPicker(e.clientX, e.clientY);
      if (!color) return;
      isTrackingDrag = true;
      highlight(color);
      // Capture so the terminating pointerup always reaches up(), even when the
      // drag wanders off the picker. Without capture that up is lost (pen/mouse
      // get no implicit capture), leaving the drag and highlight stale — and a
      // later tap in a hexagon gap would commit the old color.
      capturePointer(picker, e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    move(e: PointerEvent) {
      if (!isTrackingDrag) return;
      highlight(findHexagonInPicker(e.clientX, e.clientY));
      e.preventDefault();
      e.stopPropagation();
    },
    up(e: PointerEvent) {
      if (!isTrackingDrag) return;
      isTrackingDrag = false;
      // Even when the up-point is beyond the snap radius, a swatch still
      // highlighted from this gesture is what the user sees — commit it.
      const color = findHexagonInPicker(e.clientX, e.clientY) ?? highlighted;
      if (color) pick(color);
      e.preventDefault();
      e.stopPropagation();
    },
    leave() {
      if (!isTrackingDrag) highlight(null);
    },
    reset,
    invalidateLayout() {
      hexCenters = null;
    },
  };
}
