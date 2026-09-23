// A stand-in for the Appium server the launch diagnostic starts, so the full
// spawn → ready → session → read-log → classify path can be exercised without a
// blocked iPad. It answers /status, logs the innermost cause the real server
// logs, and fails the session the way Appium does.
//
// `MODE` selects the behaviour under test: `denial` reproduces the automation
// prompt, `silent` answers without ever logging a cause, and `crash` exits
// before becoming ready. `stale-discovery` reproduces a server whose device
// discovery cannot see the iPad: it refuses every session with XCUITest's
// `Unknown device` message unless the session names `EXPECT_WDA_URL` as its
// `appium:webDriverAgentUrl`, the capability that skips discovery.
import { createServer } from 'node:http';

const port = Number(process.argv[2]);
const mode = process.env.MODE ?? 'denial';

if (mode === 'crash') process.exit(3);

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ value }));
};

function staleDiscovery(req, res) {
  if (req.method === 'DELETE') return json(res, 200, null);
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const capabilities = JSON.parse(body || '{}').capabilities?.alwaysMatch ?? {};
    const wdaUrl = capabilities['appium:webDriverAgentUrl'];
    if (wdaUrl && wdaUrl === process.env.EXPECT_WDA_URL) {
      return json(res, 200, { sessionId: 'recovered-session', capabilities });
    }
    json(res, 500, {
      error: 'unknown error',
      message: `Unknown device or simulator UDID: '${capabilities['appium:udid']}'`,
    });
  });
}

createServer((req, res) => {
  if (req.url === '/status') return json(res, 200, { ready: true });
  if (mode === 'stale-discovery') return staleDiscovery(req, res);
  if (mode === 'denial') {
    console.log('[XCUITest] Error: Timed out while enabling automation mode');
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ value: { error: 'unknown error', message: 'xcodebuild failed' } }));
}).listen(port, '127.0.0.1');
