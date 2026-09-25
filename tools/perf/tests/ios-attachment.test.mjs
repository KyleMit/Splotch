import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAKE_IOS_UDID } from '../lib/device-identifiers.mjs';
import {
  classifyIosAttachment,
  emptyUsbListDetail,
  parseDevicectlListing,
  physicalIpads,
} from '../lib/ios-attachment.mjs';

// `usb.json` is a recorded `xcrun devicectl list devices --json-output -`
// (devicectl 642.16) of the rig iPad on its cable plus one simulator, pruned to
// the fields read here and with every identifier replaced by a fake. The other
// two change only the physical iPad's connection fields: `localNetwork` is the
// transport devicectl reported for the Wi-Fi-only iPad of epic 2210's first
// visit, and `unavailable` is a paired iPad CoreDevice cannot reach at all.
const fixture = (name) =>
  readFileSync(join(import.meta.dirname, 'fixtures', 'devicectl', `${name}.json`), 'utf8');

const listing = (name) => parseDevicectlListing(fixture(name));

function withRigIpad(name, edit) {
  const parsed = listing(name);
  edit(parsed.result.devices[0]);
  return parsed;
}

const disconnected = (device) => {
  device.properties.connection.state = 'disconnected';
  device.connectionProperties.tunnelState = 'disconnected';
};

const pairedIphone = (device) => {
  device.properties.hardware.deviceType = 'iPhone';
  device.hardwareProperties.deviceType = 'iPhone';
};

describe('iOS attachment from devicectl', () => {
  it('reads only the physical iPad, never a simulator', () => {
    expect(physicalIpads(listing('usb'))).toEqual([
      expect.objectContaining({ name: 'Rig iPad', transport: 'wired', connected: true }),
    ]);
  });

  it('ignores a paired iPhone', () => {
    expect(physicalIpads(withRigIpad('local-network-only', pairedIphone))).toEqual([]);
  });

  it.each([
    ['usb', 'usb'],
    ['local-network-only', 'local-network-only'],
    ['absent', 'unreachable'],
  ])('classifies the %s recording as %s', (name, attachment) => {
    const [device] = physicalIpads(listing(name));
    expect(classifyIosAttachment(device)).toBe(attachment);
  });

  it('does not take a kept localNetwork label on a disconnected iPad for reachability', () => {
    const [device] = physicalIpads(withRigIpad('local-network-only', disconnected));
    expect(classifyIosAttachment(device)).toBe('unreachable');
  });

  it('reads an Xcode that has only the deprecated connection dictionaries', () => {
    const legacy = withRigIpad('local-network-only', (device) => delete device.properties);
    const [device] = physicalIpads(legacy);
    expect(device).toEqual(
      expect.objectContaining({ name: 'Rig iPad', transport: 'localNetwork', connected: true })
    );
    expect(classifyIosAttachment(device)).toBe('local-network-only');
  });
});

describe('the empty `idevice_id -l` detail', () => {
  const PLAIN = 'no device from `idevice_id -l`';

  it('names a Wi-Fi-only iPad and points at the cable and the Trust prompt', () => {
    const detail = emptyUsbListDetail(listing('local-network-only'));
    expect(detail).toContain('Rig iPad is attached only over the local network');
    expect(detail).toContain('Reseat the USB cable and tap Trust');
  });

  it('matches the requested --ios-udid in any case', () => {
    expect(
      emptyUsbListDetail(listing('local-network-only'), FAKE_IOS_UDID.toLowerCase())
    ).toContain('attached only over the local network');
  });

  it('keeps the plain message when the Wi-Fi-only iPad is not the requested one', () => {
    expect(emptyUsbListDetail(listing('local-network-only'), 'another-ipad-udid')).toBe(PLAIN);
  });

  it('points a wired iPad the USB list misses at the sandbox first', () => {
    const detail = emptyUsbListDetail(listing('usb'));
    expect(detail).toMatch(
      /^no device from `idevice_id -l`, though devicectl reports Rig iPad wired/
    );
    expect(detail).toContain('outside');
  });

  it.each([
    ['an unreachable paired iPad', () => listing('absent')],
    [
      'a disconnected iPad still labelled localNetwork',
      () => withRigIpad('local-network-only', disconnected),
    ],
    ['a Wi-Fi-only paired iPhone', () => withRigIpad('local-network-only', pairedIphone)],
    ['no devicectl output', () => parseDevicectlListing('')],
    ['unparseable devicectl output', () => parseDevicectlListing('Name  Hostname\n---')],
  ])('keeps the plain message for %s', (_, read) => {
    expect(emptyUsbListDetail(read())).toBe(PLAIN);
  });
});
