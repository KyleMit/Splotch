import { PAGE_INVENTORY_THEMES } from './page-inventory-data.mjs';
const PAGE_INVENTORY_DEVICES = [
  ['iphone-13-mini', 'Small iPhone', 'iPhone 13 mini', 'phone', 375, 812],
  ['iphone-16-pro-max', 'Large iPhone', 'iPhone 16 Pro Max', 'phone', 440, 956],
  ['ipad-mini-7', 'iPad mini', 'iPad mini 7th Gen (2024)', 'tablet', 744, 1133],
  ['ipad-pro-13-m4', 'Large iPad Pro', 'iPad Pro 13-inch (M4)', 'tablet', 1032, 1376],
].map(([id, category, device, formFactor, width, height]) => ({
  id,
  category,
  device,
  formFactor,
  width,
  height,
}));

export const PAGE_INVENTORY_VIEWPORTS = [
  ...PAGE_INVENTORY_DEVICES.map((device) => ({ ...device, orientation: 'portrait' })),
  ...PAGE_INVENTORY_DEVICES.map((device) => ({
    ...device,
    id: `${device.id}-landscape`,
    width: device.height,
    height: device.width,
    orientation: 'landscape',
  })),
];

export { PAGE_INVENTORY_THEMES };

export function inventoryCaptureKey(viewport, theme) {
  return `${viewport.id}--${theme.id}`;
}

function inventoryCapturePath(item, viewport, theme) {
  return `assets/${item.group}/${item.id}--${viewport.id}--${theme.id}.webp`;
}

export function attachExpectedCapturePaths(items) {
  for (const item of items) {
    item.captures = Object.fromEntries(
      PAGE_INVENTORY_THEMES.flatMap((theme) =>
        PAGE_INVENTORY_VIEWPORTS.map((viewport) => [
          inventoryCaptureKey(viewport, theme),
          inventoryCapturePath(item, viewport, theme),
        ])
      )
    );
  }
  return items;
}
