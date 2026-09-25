import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyIosAttachment,
  emptyUsbListDetail,
  parseDevicectlListing,
  physicalIosDevices,
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

describe('iOS attachment from devicectl', () => {
  it('reads only the physical iPad, never a simulator', () => {
    expect(physicalIosDevices(listing('usb'))).toEqual([
      expect.objectContaining({ name: 'Rig iPad', transport: 'wired', unavailable: false }),
    ]);
  });

  it.each([
    ['usb', 'usb'],
    ['local-network-only', 'local-network-only'],
    ['absent', 'unavailable'],
  ])('classifies the %s recording as %s', (name, attachment) => {
    const [device] = physicalIosDevices(listing(name));
    expect(classifyIosAttachment(device)).toBe(attachment);
  });

  it('reads an Xcode that has only the deprecated connection dictionaries', () => {
    const [device] = listing('local-network-only').result.devices;
    delete device.properties;
    expect(physicalIosDevices({ result: { devices: [device] } })).toEqual([
      expect.objectContaining({ name: 'Rig iPad', transport: 'localNetwork' }),
    ]);
  });
});

describe('the empty `idevice_id -l` detail', () => {
  it('names a Wi-Fi-only iPad and points at the cable and the Trust prompt', () => {
    const detail = emptyUsbListDetail(listing('local-network-only'));
    expect(detail).toContain('Rig iPad is attached only over the local network');
    expect(detail).toContain('Reseat the USB cable and tap Trust');
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
    ['no devicectl output', () => parseDevicectlListing('')],
    ['unparseable devicectl output', () => parseDevicectlListing('Name  Hostname\n---')],
  ])('keeps the plain message for %s', (_, read) => {
    expect(emptyUsbListDetail(read())).toBe('no device from `idevice_id -l`');
  });
});
