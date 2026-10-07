import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import {
  fixtureCommandExpression,
  writerAcknowledgement,
  WRITER_ACK_PHASE,
} from '../android-writer-ack.mjs';
import { SOURCE_REVISIONS } from '../contract.mjs';

const VM_DEADLINE_MS = 100;
const NONCE = 'a'.repeat(32);
const context = {
  nonce: NONCE,
  platform: 'android',
  input: {
    role: 'released',
    revision: SOURCE_REVISIONS.released,
    configuration: { heldNamespace: { database: 'control', store: 'held', key: 'pictures' } },
  },
};
const absent = { status: 'absent-record', count: 0 };

async function actualWire() {
  const events = [];
  for (const [index, command] of ['raw', 'seed'].entries()) {
    const result =
      command === 'raw'
        ? {
            held: absent,
            native: true,
            drawingSurface: false,
            origin: 'https://localhost',
            href: 'https://localhost/legacy-continuity.html',
            observation: { bundleId: 'art.splotch.app', platform: 'android' },
          }
        : { phase: WRITER_ACK_PHASE, snapshot: { held: absent } };
    const sandbox = createContext({
      window: {
        __SPLOTCH_L0__: {
          run: async (actualCommand, nonce) => {
            expect(actualCommand).toBe(command);
            expect(nonce).toBe(NONCE);
            return {
              command,
              nonce,
              role: context.input.role,
              revision: context.input.revision,
              result,
            };
          },
        },
      },
    });
    const expression = fixtureCommandExpression(command, NONCE);
    const value = await runInContext(expression, sandbox, { timeout: VM_DEADLINE_MS });
    events.push(
      {
        sentAt: '2026-10-07T05:00:00.000Z',
        sent: {
          id: index + 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        },
      },
      {
        receivedAt: '2026-10-07T05:00:00.001Z',
        received: JSON.stringify({ id: index + 1, result: { result: { type: 'string', value } } }),
      }
    );
  }
  return events;
}
const wire = (events) => events.map((event) => JSON.stringify(event)).join('\n') + '\n';

describe('legacy writer acknowledgement encoding', () => {
  it('binds the template phase and real shared expression before decoding a string acknowledgement', async () => {
    const template = readFileSync(
      new URL('../templates/fixture.ts.template', import.meta.url),
      'utf8'
    );
    const phases = [...template.matchAll(/phase: '([^']+)'/g)].map((match) => match[1]);
    expect(phases).toContain(WRITER_ACK_PHASE);
    const events = await actualWire();
    expect(writerAcknowledgement(wire(events), context).report.result.phase).toBe(WRITER_ACK_PHASE);
    const object = structuredClone(events);
    const response = JSON.parse(object[3].received);
    response.result.result = { type: 'object', value: JSON.parse(response.result.result.value) };
    object[3].received = JSON.stringify(response);
    expect(() => writerAcknowledgement(wire(object), context)).toThrow(/ENCODING_CHANGED/);
    expect(writerAcknowledgement(wire(events), context).rawPreimage.report.command).toBe('raw');
  });

  it('refuses unmatched responses, missing raw preimages and changed nonce before restoring actual producer bytes', async () => {
    const events = await actualWire();
    const unmatched = structuredClone(events);
    const response = JSON.parse(unmatched[3].received);
    response.id = 999;
    unmatched[3].received = JSON.stringify(response);
    expect(writerAcknowledgement(wire(unmatched), context)).toBeUndefined();
    expect(() => writerAcknowledgement(wire(events.slice(2)), context)).toThrow(
      /RAW_PREIMAGE_MISSING/
    );
    const changed = structuredClone(events);
    const reply = JSON.parse(changed[3].received);
    const report = JSON.parse(reply.result.result.value);
    report.nonce = 'b'.repeat(32);
    reply.result.result.value = JSON.stringify(report);
    changed[3].received = JSON.stringify(reply);
    expect(() => writerAcknowledgement(wire(changed), context)).toThrow(/NONCE_CHANGED/);
    expect(writerAcknowledgement(wire(events), context).report.nonce).toBe(NONCE);
    expect(writerAcknowledgement(wire(events).slice(0, -20), context)).toBeUndefined();
  });
});
