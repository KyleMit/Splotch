import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './web-host-source.mjs';

function normalizedText(bytes, copyRoot, shellUrl) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) return null;
  return text
    .replaceAll(`${copyRoot}/`, '<owned-copy>/')
    .replaceAll(shellUrl, '<recorded-app-shell>');
}

export function compareProductBytes({ referenceRoot, controlRoot, reference, control }) {
  const normalized = [];
  for (const [output, entries] of Object.entries(reference.outputs)) {
    const controlEntries = new Map(control.outputs[output].map((entry) => [entry.path, entry]));
    for (const entry of entries) {
      const other = controlEntries.get(entry.path);
      if (!other || entry.link !== other.link)
        throw new Error(`Product output/link differs: ${output}/${entry.path}`);
      if (entry.kind !== other.kind || entry.mode !== other.mode)
        throw new Error(`Product output kind/mode differs: ${output}/${entry.path}`);
      if (entry.sha256 === other.sha256) continue;
      if (entry.link) throw new Error(`Product symlink differs: ${output}/${entry.path}`);
      const left = readFileSync(join(referenceRoot, output, entry.path));
      const right = readFileSync(join(controlRoot, output, entry.path));
      const leftText = normalizedText(left, referenceRoot, reference.appShellUrl);
      const rightText = normalizedText(right, controlRoot, control.appShellUrl);
      if (leftText === null || rightText === null || leftText !== rightText) {
        throw new Error(
          `Unexplained retained-control product bytes differ: ${output}/${entry.path}`
        );
      }
      normalized.push({
        path: `${output}/${entry.path}`,
        referenceSha256: entry.sha256,
        controlSha256: other.sha256,
        normalizedSha256: sha256(leftText),
      });
    }
  }
  return {
    compared: 'complete emitted bytes',
    normalized,
    allowances: ['recorded per-build app-shell URL', 'explicit owned-copy absolute path prefix'],
    buildTime: 'identical pinned owner metadata; no time normalization',
  };
}
