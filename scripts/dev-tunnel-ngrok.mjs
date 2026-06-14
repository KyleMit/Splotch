// Starts `vite dev --host` and exposes it on a public https://*.ngrok.* URL via
// ngrok, for previewing the dev server on a phone from a Claude Code on the web
// cloud session — where the Cloudflare quick tunnel (dev:tunnel) can't reach its
// edge. See ADR-0021 and docs/CLOUD.md for why ngrok is the cloud-session path.
//
// Needs an ngrok authtoken in NGROK_AUTHTOKEN (free at https://dashboard.ngrok.com)
// and, in a cloud session, the *.ngrok.com / *.ngrok-agent.com / *.ngrok.io hosts
// on the egress allowlist. ngrok's agent reaches its edge over TCP/443, which the
// SNI-based allowlist proxy forwards once those names are allowed.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import ngrok from '@ngrok/ngrok';

const PORT = Number(process.env.PORT) || 5173;
const ORIGIN = `http://localhost:${PORT}`;
const isWin = process.platform === 'win32';

const children = [];
let listener;

async function shutdown(code = 0) {
  try {
    await listener?.close();
  } catch {}
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

if (!process.env.NGROK_AUTHTOKEN) {
  console.error(
    '\nNGROK_AUTHTOKEN is not set. ngrok needs a (free) authtoken to open a tunnel.\n' +
      'Get one at https://dashboard.ngrok.com/get-started/your-authtoken and set it as\n' +
      'an environment variable. In a Claude Code cloud session, add it via the env\n' +
      'settings dialog. Off-cloud, prefer `npm run dev:tunnel` (Cloudflare, no account).\n',
  );
  process.exit(1);
}

const vite = spawn('npm', ['run', 'dev:host'], { stdio: 'inherit', shell: isWin });
children.push(vite);
vite.on('exit', (code) => shutdown(code ?? 0));

if (!(await waitForServer())) {
  console.error(`\nDev server never came up on ${ORIGIN}. Aborting tunnel.`);
  await shutdown(1);
}

try {
  listener = await ngrok.forward({ addr: PORT, authtoken_from_env: true });
  const url = listener.url();
  const banner = '═'.repeat(Math.max(url.length, 28) + 6);
  console.log(`\n${banner}\n   View on your phone:\n   ${url}\n${banner}\n`);
} catch (err) {
  console.error(
    '\nCould not open the ngrok tunnel. The network is likely blocking it.\n' +
      'If you are in a restricted environment (e.g. a Claude Code cloud session),\n' +
      'add these hosts to the network egress allowlist and retry:\n' +
      '  *.ngrok.com, *.ngrok-agent.com, *.ngrok.io\n' +
      `Underlying error: ${err?.message ?? err}\n`,
  );
  await shutdown(1);
}
