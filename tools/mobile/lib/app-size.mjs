// Parsing and reporting for `report-app-size.mjs`. Everything here is pure so the
// size arithmetic is testable without bundletool, Xcode, or a built app.

// Apple's thinning report prints decimal units ("7.4 MB" is 7,400,000 bytes).
const APPLE_UNIT_BYTES = { KB: 1e3, MB: 1e6, GB: 1e9 };
const DISPLAY_MB_BYTES = 1e6;

export const PLATFORMS = /** @type {const} */ (['android', 'ios']);
export const APPS = /** @type {const} */ (['shipping', 'rn']);

export const APP_LABELS = { shipping: 'Shipping', rn: 'RN' };
export const PLATFORM_LABELS = { android: 'Android', ios: 'iOS' };

/**
 * Parses `bundletool get-size total` CSV output, which is a header row ending in
 * MIN,MAX followed by one row per dimension combination.
 * @param {string} text
 * @returns {{ dimensions: Record<string, string>, min: number, max: number }[]}
 */
export function parseBundletoolSizeCsv(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIndex = lines.findIndex((line) => /(^|,)MIN,MAX$/.test(line));
  if (headerIndex === -1) throw new Error(`bundletool size output has no MIN,MAX header:\n${text}`);
  const header = lines[headerIndex].split(',');
  return lines.slice(headerIndex + 1).map((line) => {
    const cells = line.split(',');
    if (cells.length !== header.length) {
      throw new Error(
        `bundletool size row has ${cells.length} cells, expected ${header.length}: ${line}`
      );
    }
    const dimensions = Object.fromEntries(header.slice(0, -2).map((name, i) => [name, cells[i]]));
    const min = Number(cells.at(-2));
    const max = Number(cells.at(-1));
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`bundletool size row is not whole bytes: ${line}`);
    }
    return { dimensions, min, max };
  });
}

/**
 * @param {string} text e.g. "7.4 MB", "812 KB", "Zero KB"
 * @returns {number} bytes
 */
export function parseAppleSize(text) {
  const match = /^(Zero|[\d.]+)\s*(KB|MB|GB)$/.exec(text.trim());
  if (!match) throw new Error(`Unrecognised size in thinning report: "${text}"`);
  if (match[1] === 'Zero') return 0;
  return Math.round(Number(match[1]) * APPLE_UNIT_BYTES[/** @type {'KB'|'MB'|'GB'} */ (match[2])]);
}

/** @param {string} version e.g. "17.4" */
function versionKey(version) {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major * 1000 + minor;
}

/**
 * Parses Xcode's "App Thinning Size Report.txt".
 * @param {string} text
 * @returns {{ name: string, universal: boolean, descriptors: { device: string, osVersion: string }[], compressed: number, uncompressed: number }[]}
 */
export function parseThinningReport(text) {
  const blocks = text.split(/^Variant:\s*/m).slice(1);
  if (blocks.length === 0) throw new Error('Thinning report lists no variants');
  return blocks.map((block) => {
    const name = block.split('\n')[0].trim();
    const descriptorLine = /^Supported variant descriptors:\s*(.*)$/m.exec(block)?.[1] ?? '';
    const appSize = /^App size:\s*(.+?) compressed,\s*(.+?) uncompressed/m.exec(block);
    if (!appSize) throw new Error(`Thinning variant ${name} has no "App size:" line`);
    return {
      name,
      universal: /universal/i.test(descriptorLine),
      // Model identifiers contain a comma ("iPad13,8"), so the device ends at ", os-version:".
      descriptors: [
        ...descriptorLine.matchAll(/device:\s*([^\]]+?),\s*os-version:\s*([\d.]+)\]/g),
      ].map((m) => ({ device: m[1], osVersion: m[2] })),
      compressed: parseAppleSize(appSize[1]),
      uncompressed: parseAppleSize(appSize[2]),
    };
  });
}

/**
 * The variant a device on a given OS downloads. A descriptor's os-version is the
 * variant's minimum OS, so the device gets the highest one it meets; a newer variant
 * is bytes it cannot install.
 * @param {ReturnType<typeof parseThinningReport>} variants
 * @param {string} deviceModel e.g. "iPad13,8"
 * @param {string} osVersion the device's OS, e.g. "26.5"
 */
export function selectThinningVariant(variants, deviceModel, osVersion) {
  const forModel = variants.flatMap((variant) =>
    variant.descriptors
      .filter((descriptor) => descriptor.device === deviceModel)
      .map((descriptor) => ({ variant, os: descriptor.osVersion }))
  );
  if (forModel.length === 0) {
    const known = [
      ...new Set(variants.flatMap((variant) => variant.descriptors.map((d) => d.device))),
    ].sort();
    throw new Error(`No thinned variant lists ${deviceModel}. Variants cover: ${known.join(', ')}`);
  }
  const compatible = forModel.filter((c) => versionKey(c.os) <= versionKey(osVersion));
  if (compatible.length === 0) {
    const listed = [...new Set(forModel.map((c) => c.os))].sort(
      (a, b) => versionKey(a) - versionKey(b)
    );
    throw new Error(
      `No thinned variant for ${deviceModel} installs on OS ${osVersion}; it is listed for ${listed.join(', ')}`
    );
  }
  return compatible.reduce((best, c) => (versionKey(c.os) > versionKey(best.os) ? c : best))
    .variant;
}

/** @param {number[]} values */
function range(values) {
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * The thinned (per-device) variants, excluding the universal fallback IPA that
 * the App Store serves to no current device.
 * @param {ReturnType<typeof parseThinningReport>} variants
 */
export function thinnedVariantRange(variants) {
  const thinned = variants.filter((variant) => !variant.universal);
  const pool = thinned.length > 0 ? thinned : variants;
  return {
    download: range(pool.map((variant) => variant.compressed)),
    install: range(pool.map((variant) => variant.uncompressed)),
  };
}

/**
 * @typedef {{
 *   platform: typeof PLATFORMS[number],
 *   app: typeof APPS[number],
 *   artifact: string,
 *   method: string,
 *   device: string,
 *   download: number,
 *   install: number,
 *   downloadRange?: { min: number, max: number },
 *   notes: string[],
 * }} SizeResult
 */

/** @param {number} bytes */
function formatMegabytes(bytes) {
  return `${(bytes / DISPLAY_MB_BYTES).toFixed(1)} MB`;
}

/** @param {number} rn @param {number} shipping */
function formatDelta(rn, shipping) {
  const diff = rn - shipping;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  const percent =
    shipping === 0 ? '' : ` (${sign}${Math.abs((diff / shipping) * 100).toFixed(0)}%)`;
  return `${sign}${formatMegabytes(Math.abs(diff))}${percent}`;
}

/**
 * @param {SizeResult[]} results
 * @returns {string}
 */
export function renderMarkdown(results) {
  const lines = [
    '| Platform | App | Device | Download | Install | Download range, all devices | Method |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    const rangeCell = r.downloadRange
      ? `${formatMegabytes(r.downloadRange.min)} – ${formatMegabytes(r.downloadRange.max)}`
      : '—';
    lines.push(
      `| ${PLATFORM_LABELS[r.platform]} | ${APP_LABELS[r.app]} | ${r.device} | ${formatMegabytes(r.download)} | ${formatMegabytes(r.install)} | ${rangeCell} | ${r.method} |`
    );
  }
  const deltas = PLATFORMS.flatMap((platform) => {
    const shipping = results.find((r) => r.platform === platform && r.app === 'shipping');
    const rn = results.find((r) => r.platform === platform && r.app === 'rn');
    if (!shipping || !rn) return [];
    return [
      `* ${PLATFORM_LABELS[platform]}, RN vs shipping: download ${formatDelta(rn.download, shipping.download)}, install ${formatDelta(rn.install, shipping.install)}`,
    ];
  });
  const notes = results.flatMap((r) =>
    r.notes.map((note) => `* ${PLATFORM_LABELS[r.platform]} ${APP_LABELS[r.app]}: ${note}`)
  );
  return [lines.join('\n'), deltas.join('\n'), notes.join('\n')].filter(Boolean).join('\n\n');
}
