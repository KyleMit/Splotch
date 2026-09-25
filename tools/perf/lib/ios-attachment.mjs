// Why `idevice_id -l` came back empty, read from what CoreDevice still sees.
//
// usbmux — and so `idevice_id`, `iproxy` and WDA — reaches an iPad only over
// USB. CoreDevice (`xcrun devicectl`) also reaches a paired iPad over the local
// network, so an iPad knocked off its cable stays "connected" to devicectl
// while every capture path fails. Epic 2210's first person-session visit lost
// its bring-up to exactly that, behind a preflight line saying only that
// `idevice_id -l` listed nothing.
import { rethrowIfBroken } from './error-classification.mjs';

export const DEVICECTL_LIST_ARGS = [
  'devicectl',
  'list',
  'devices',
  '--quiet',
  '--json-output',
  '-',
];

const WIRED_TRANSPORT = 'wired';
const LOCAL_NETWORK_TRANSPORT = 'localNetwork';
const CONNECTED_STATE = 'connected';

const NO_USB_DEVICE_DETAIL = 'no device from `idevice_id -l`';

export function parseDevicectlListing(stdout) {
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch (error) {
    rethrowIfBroken(error);
    return null;
  }
}

// `properties` is devicectl's replacement for the deprecated top-level
// dictionaries; the fallbacks keep an Xcode that predates it readable.
export function physicalIpads(listing) {
  return (listing?.result?.devices ?? [])
    .map((device) => {
      const hardware = device.properties?.hardware ?? device.hardwareProperties ?? {};
      const connection = device.properties?.connection ?? {};
      const legacyConnection = device.connectionProperties ?? {};
      return {
        name: device.properties?.state?.name ?? device.deviceProperties?.name ?? 'the iPad',
        udid: hardware.udid ?? null,
        deviceType: hardware.deviceType,
        reality: hardware.reality,
        transport: connection.transportType ?? legacyConnection.transportType ?? null,
        connected: (connection.state ?? legacyConnection.tunnelState) === CONNECTED_STATE,
      };
    })
    .filter((device) => device.reality === 'physical' && device.deviceType === 'iPad');
}

// A transport label alone is not reachability: a paired device keeps a
// `disconnected` or `unavailable` state beside it, and naming the cable for an
// iPad CoreDevice cannot reach would send the operator to the wrong fault.
export function classifyIosAttachment(device) {
  if (!device.connected) return 'unreachable';
  if (device.transport === WIRED_TRANSPORT) return 'usb';
  if (device.transport === LOCAL_NETWORK_TRANSPORT) return 'local-network-only';
  return 'unreachable';
}

// The detail for the blocked `ios device` check when `idevice_id -l` is empty.
// `udid` is the `--ios-udid` the operator named, when they named one.
export function emptyUsbListDetail(listing, udid = null) {
  const candidates = physicalIpads(listing).filter(
    (device) => !udid || device.udid?.toUpperCase() === udid.toUpperCase()
  );
  const attached = (kind) => candidates.find((device) => classifyIosAttachment(device) === kind);
  const networkOnly = attached('local-network-only');
  if (networkOnly) {
    return (
      `${networkOnly.name} is attached only over the local network: devicectl reaches it, but ` +
      'usbmux, iproxy and WDA need USB. Reseat the USB cable and tap Trust on the iPad.'
    );
  }
  const wired = attached('usb');
  if (wired) {
    return (
      `${NO_USB_DEVICE_DETAIL}, though devicectl reports ${wired.name} wired. ` +
      'If this ran in a sandbox, re-run it outside one; otherwise reseat the cable and tap Trust.'
    );
  }
  return NO_USB_DEVICE_DETAIL;
}
