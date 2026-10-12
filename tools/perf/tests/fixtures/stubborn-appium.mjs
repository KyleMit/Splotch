// A diagnostic server that answers like Appium and IGNORES SIGTERM, so the
// teardown's escalation is exercised rather than assumed. The previous teardown
// raced a fixed timeout and returned with a child still listening.
import { createServer } from 'node:http';

process.on('SIGTERM', () => {});

const port = Number(process.argv[2]);
createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ value: { ready: true } }));
  }
  res.writeHead(500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ value: { error: 'unknown error' } }));
}).listen(port, '127.0.0.1');
