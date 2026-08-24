// A stand-in for the Appium server the launch diagnostic starts, so the full
// spawn → ready → session → read-log → classify path can be exercised without a
// blocked iPad. It answers /status, logs the innermost cause the real server
// logs, and fails the session the way Appium does.
//
// `MODE` selects the behaviour under test: `denial` reproduces the automation
// prompt, `silent` answers without ever logging a cause, and `crash` exits
// before becoming ready.
import { createServer } from 'node:http';

const port = Number(process.argv[2]);
const mode = process.env.MODE ?? 'denial';

if (mode === 'crash') process.exit(3);

createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ value: { ready: true } }));
  }
  if (mode === 'denial') {
    console.log('[XCUITest] Error: Timed out while enabling automation mode');
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ value: { error: 'unknown error', message: 'xcodebuild failed' } }));
}).listen(port, '127.0.0.1');
