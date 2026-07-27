export const DEVICES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.6 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

export const IPAD_PRO = { ...DEVICES.tablet, label: 'ipad-pro-12.9' };

export function resolveDevice(name) {
  return DEVICES[name] || DEVICES.phone;
}
