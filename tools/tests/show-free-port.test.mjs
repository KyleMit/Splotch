import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { findFreePort, probePort, showFreePort } from '../show-free-port.mjs';

const CLI = fileURLToPath(new URL('../show-free-port.mjs', import.meta.url));
// A Node start under a loaded host can exceed Vitest's 5 s default.
const CLI_TEST_TIMEOUT_MS = 20_000;

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  );
});

function occupyPort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      servers.push(server);
      resolve(server.address().port);
    });
  });
}

async function releasedPort() {
  const port = await occupyPort();
  await new Promise((resolve) => servers.pop().close(resolve));
  return port;
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

describe('show-free-port', () => {
  it('recognizes a held local port and leaves its listener running', async () => {
    const port = await occupyPort();
    expect(await probePort(port)).toBe(false);
    expect(servers[0].listening).toBe(true);
  });

  it('recognizes a port held on IPv6 localhost', async () => {
    const port = await occupyPort('::1');
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

  it.each(['0', '65536', '-1', '5300junk', '1e3', '0x14b4', '53.5', ''])(
    'rejects the port %j by the shared TCP port rule',
    async (value) => {
      await expect(showFreePort([`--from=${value}`])).rejects.toThrow(
        new Error(`--from must be an integer >= 1 and <= 65535, got "${value}"`)
      );
      await expect(showFreePort([`--to=${value}`])).rejects.toThrow(
        new Error(`--to must be an integer >= 1 and <= 65535, got "${value}"`)
      );
    }
  );

  it('keeps rejecting a port with a leading zero', async () => {
    await expect(showFreePort(['--from=080'])).rejects.toThrow(
      new Error('--from must not have a leading zero, got "080"')
    );
    await expect(showFreePort(['--to=05399'])).rejects.toThrow(
      new Error('--to must not have a leading zero, got "05399"')
    );
  });

  it(
    'prints the one free port in a valid range and exits 0',
    async () => {
      const port = await releasedPort();
      expect(runCli(['--from', `${port}`, '--to', `${port}`])).toMatchObject({
        status: 0,
        stdout: `${port}\n`,
        stderr: '',
      });
    },
    CLI_TEST_TIMEOUT_MS
  );

  it(
    'exits 1 when every port in a valid range is held',
    async () => {
      const port = await occupyPort();
      const result = runCli([`--from=${port}`, `--to=${port}`]);
      expect(result).toMatchObject({ status: 1, stdout: '' });
      expect(result.stderr).toContain(`No free port from ${port} to ${port} on localhost`);
    },
    CLI_TEST_TIMEOUT_MS
  );

  it(
    'exits 1 on a port past the TCP ceiling',
    () => {
      const result = runCli(['--to=65536']);
      expect(result).toMatchObject({ status: 1, stdout: '' });
      expect(result.stderr).toContain('--to must be an integer >= 1 and <= 65535, got "65536"');
    },
    CLI_TEST_TIMEOUT_MS
  );
});
