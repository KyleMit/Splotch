import { spawn } from 'node:child_process';

const CHILD_TERMINATION_GRACE_MS = 3_000;
const CHILD_TERMINATION_POLL_MS = 25;

export function spawnOwnedChild(command, args, options) {
  return spawn(command, args, { ...options, detached: true });
}

// Playwright's default webServer cleanup signals the inherited process group.
export function spawnPreviewChild(command, args, options) {
  return spawn(command, args, { ...options, detached: false });
}

function stopOwnedChild(child, signal) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function ownedGroupExists(child) {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

export async function terminateOwnedChild(child) {
  stopOwnedChild(child, 'SIGTERM');
  const deadline = Date.now() + CHILD_TERMINATION_GRACE_MS;
  while (ownedGroupExists(child) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CHILD_TERMINATION_POLL_MS));
  }
  const escalated = ownedGroupExists(child);
  if (escalated) stopOwnedChild(child, 'SIGKILL');
  return { groupPid: child.pid ?? null, gracefulSignal: 'SIGTERM', escalated };
}
