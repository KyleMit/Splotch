import { randomUUID } from 'node:crypto';
import { sleep } from '../../lib/proc.mjs';
import { check } from '../../lib/smoke.mjs';
import { adminClient } from './admin-client.mjs';
import { shouldWriteBlobsProbe } from './deployed-admin-target.mjs';

const READ_ATTEMPTS = 6;
const READ_RETRY_MS = 1000;

export async function checkDeployedAdminContract(base, adminSecret) {
  const admin = adminClient(base);
  const writeProbe = shouldWriteBlobsProbe(base);
  let session;
  let probe;

  try {
    const { res: login, body: loginBody } = await admin.login(adminSecret, { retryOn429: true });
    session = loginBody?.session;
    check(
      'admin login → 200 session',
      login.status === 200 && /^[a-f0-9]{64}$/.test(session ?? ''),
      `got ${login.status}`
    );
    if (!session) return;

    const auth = { Authorization: `Bearer ${session}` };
    const { res: list, body: listBody } = await admin.listTokens(auth);
    check(
      'GET tokens → 200 snapshot',
      list.status === 200 &&
        listBody?.ok === true &&
        Array.isArray(listBody?.tokens) &&
        Array.isArray(listBody?.invites),
      `got ${list.status}`
    );
    check(
      'Blobs is live on the deployed function (persistent:true)',
      listBody?.persistent === true,
      `persistent=${listBody?.persistent} — getStore() is failing on the deploy (ADR-0025)`
    );

    if (!writeProbe) {
      console.log('[blobs-smoke] production persistence check is read-only');
      return;
    }

    probe = `blobs-smoke-${randomUUID()}`;
    const { res: add, body: addBody } = await admin.addToken(auth, probe);
    check(
      'POST adds the probe token',
      add.status === 200 && addBody?.tokens?.includes(probe),
      `got ${add.status}`
    );
    check(
      'POST snapshot still persistent:true',
      addBody?.persistent === true,
      `persistent=${addBody?.persistent}`
    );

    let readBack = false;
    for (let attempt = 0; attempt < READ_ATTEMPTS && !readBack; attempt++) {
      if (attempt) await sleep(READ_RETRY_MS);
      const { body: after } = await admin.listTokens(auth);
      readBack = Boolean(after?.tokens?.includes(probe));
    }
    check(
      'probe token reads back from Blobs',
      readBack,
      'not visible after retries — write did not durably land'
    );

    const { res: removed, body: removedBody } = await admin.delToken(auth, probe);
    check(
      'DELETE removes the probe token',
      removed.status === 200 && !removedBody?.tokens?.includes(probe),
      `got ${removed.status}`
    );
  } finally {
    if (session && probe) {
      await admin.delToken({ Authorization: `Bearer ${session}` }, probe).catch(() => undefined);
    }
  }
}
