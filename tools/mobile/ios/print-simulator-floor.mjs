import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, isMain } from '../../lib/proc.mjs';

const PROJECT_PATH = join(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const DEPLOYMENT_TARGET_PATTERN = /IPHONEOS_DEPLOYMENT_TARGET = (\d+(?:\.\d+)*);/g;

export function iosDeploymentTarget(project) {
  const targets = new Set(
    [...project.matchAll(DEPLOYMENT_TARGET_PATTERN)].map((match) => match[1])
  );
  if (targets.size === 0) throw new Error('No IPHONEOS_DEPLOYMENT_TARGET found in the Xcode project.');
  if (targets.size > 1) {
    throw new Error(`Xcode project has multiple iOS deployment targets: ${[...targets].join(', ')}`);
  }
  return [...targets][0];
}

export function printIosSimulatorFloor() {
  console.log(iosDeploymentTarget(readFileSync(PROJECT_PATH, 'utf8')));
}

if (isMain(import.meta.url)) {
  try {
    printIosSimulatorFloor();
  } catch (error) {
    fail(error.message);
  }
}
