import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import capacitorConfig from '../../../../capacitor.config.json' with { type: 'json' };
import { runMaestroSmoke } from '../../lib/mobile-smoke-test.mjs';

const APP_LOG_CAPTURE_MS = 15000;
const APP_LOG_MAX_BYTES = 4 * 1024 * 1024;

export async function captureFailedAppStartup(device) {
  const reportDirectory = join(homedir(), '.maestro', 'tests');
  await mkdir(reportDirectory, { recursive: true });
  const output = await new Promise((resolve) => {
    execFile(
      'xcrun',
      ['simctl', 'launch', '--terminate-running-process', '--console', device, capacitorConfig.appId],
      { timeout: APP_LOG_CAPTURE_MS, maxBuffer: APP_LOG_MAX_BYTES },
      (error, stdout, stderr) => resolve({ stdout, stderr, message: error?.message })
    );
  });
  await writeFile(
    join(reportDirectory, 'ios-app-relaunch.log'),
    `Diagnostic relaunch after smoke failure; the original smoke result is unchanged.\n${output.stdout ?? ''}\n${output.stderr ?? ''}\n${output.message ?? ''}\n`
  );
}

export async function runIosSmokeWithDiagnostics(device) {
  try {
    await runMaestroSmoke({ device });
  } catch (error) {
    await captureFailedAppStartup(device).catch((diagnosticError) => {
      console.warn('Could not capture app startup diagnostics:', diagnosticError);
    });
    throw error;
  }
}
