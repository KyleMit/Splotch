import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bytesToDataUri, fileToDataUri, mimeTypeForPath } from '../lib/data-uri.mjs';

// Browsers decode a data URI by its declared type alone, so an SVG embedded as
// image/webp never loads. These pin each asset extension to its real type.
const EXTENSION_TYPES = [
  ['page.overlay.svg', 'image/svg+xml'],
  ['page.night.webp', 'image/webp'],
  ['crop.png', 'image/png'],
];

describe('mimeTypeForPath', () => {
  it.each(EXTENSION_TYPES)('types %s as %s', (path, mime) => {
    expect(mimeTypeForPath(path)).toBe(mime);
  });

  it('throws on an extension with no known type', () => {
    expect(() => mimeTypeForPath('page.outline.jpg')).toThrow(
      'no data-URI MIME type for page.outline.jpg'
    );
  });
});

describe('bytesToDataUri', () => {
  it('declares the MIME type it is given', () => {
    expect(bytesToDataUri(Buffer.from('<svg/>'), 'image/svg+xml')).toBe(
      'data:image/svg+xml;base64,PHN2Zy8+'
    );
  });

  it('throws without a MIME type', () => {
    expect(() => bytesToDataUri(Buffer.from('<svg/>'))).toThrow('bytesToDataUri needs a MIME type');
  });
});

describe('fileToDataUri', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'splotch-data-uri-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(EXTENSION_TYPES)('embeds %s as %s', (name, mime) => {
    const path = join(dir, name);
    const bytes = Buffer.from(`bytes of ${name}`);
    writeFileSync(path, bytes);

    expect(fileToDataUri(path)).toBe(`data:${mime};base64,${bytes.toString('base64')}`);
  });

  it('returns null for a missing file, so the sheet can show a placeholder', () => {
    expect(fileToDataUri(join(dir, 'absent.night.webp'))).toBeNull();
  });

  it('throws on an unknown extension rather than reading it as missing', () => {
    expect(() => fileToDataUri(join(dir, 'absent.outline.jpg'))).toThrow(
      'no data-URI MIME type for'
    );
  });
});
