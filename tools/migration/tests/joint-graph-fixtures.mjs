import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const JOINT_INPUT = 'tools/migration/inputs/native-joint-graph.json';
const RSD_INPUT = 'tools/migration/inputs/rsd-drawing-graph.json';
const SAFE_INPUT = 'tools/migration/inputs/safe-insets-graph.json';
const SVG_INPUT = 'tools/migration/inputs/native-svg-backdrop-patch.json';

export function copyJointGraphFixture(root, target) {
  const joint = JSON.parse(readFileSync(join(root, JOINT_INPUT)));
  const rsd = JSON.parse(readFileSync(join(root, RSD_INPUT)));
  const safe = JSON.parse(readFileSync(join(root, SAFE_INPUT)));
  const names = new Set([
    JOINT_INPUT,
    RSD_INPUT,
    SAFE_INPUT,
    SVG_INPUT,
    joint.audioLock,
    joint.audioWorkspace,
    ...joint.files.map(({ path }) => path),
    ...rsd.actualFiles.map(({ path }) => path),
    ...Object.values(rsd.baselineFiles).map(({ path }) => path),
    ...['approvedLock', 'archiveReuse', 'rootApproval', 'rootArchiveApproval'].map(
      (key) => rsd[key].path
    ),
    ...safe.actualFiles.map(({ path }) => path),
    ...Object.values(safe.priorActualFiles).map(({ path }) => path),
    ...[
      'approvedLock',
      'priorApprovedLock',
      'rootApproval',
      'wholeMetadata',
      'archiveAdmission',
      'archiveInventory',
      'publication',
      'archiveMemberManifest',
      'packageManifest',
    ].map((key) => safe[key].path),
  ]);
  for (const name of names) {
    mkdirSync(dirname(join(target, name)), { recursive: true });
    copyFileSync(join(root, name), join(target, name));
  }
}
