import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { findFreePort, probePort } from '../show-free-port.mjs';

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  );
});

function occupyPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      resolve(server.address().port);
    });
  });
}

describe('show-free-port', () => {
  it('recognizes a held local port and leaves its listener running', async () => {
    const port = await occupyPort();
    expect(await probePort(port)).toBe(false);
    expect(servers[0].listening).toBe(true);
  });

  it('finds the first probeable port in range and fails when none is free', async () => {
    const calls = [];
    const probe = async (port) => {
      calls.push(port);
      return port === 5302;
    };
    expect(await findFreePort({ from: 5300, to: 5302, probe })).toBe(5302);
    expect(calls).toEqual([5300, 5301, 5302]);
    await expect(findFreePort({ from: 5300, to: 5301, probe })).rejects.toThrow('No free port');
  });

  it('rejects a reversed range', async () => {
    await expect(findFreePort({ from: 5400, to: 5300 })).rejects.toThrow('--from');
  });
});
