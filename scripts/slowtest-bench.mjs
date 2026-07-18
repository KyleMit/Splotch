// Drives /api/slowtest against a deployed preview to find Netlify's real
// synchronous-function timeout and buffered request-size limit. Pairs with the
// throwaway web/src/routes/api/slowtest/+server.ts on the same feature branch.
//
//   node scripts/slowtest-bench.mjs <baseUrl> [--sweep 5000,8000,...] [--size 1,4,6,8]
//
// It measures client-observed wall-clock and status per request: a successful
// JSON body means Splotch answered; a non-2xx at a consistent wall-clock is the
// platform cutting the invocation off at the real ceiling.

const args = process.argv.slice(2);
const base = args[0]?.replace(/\/$/, '');
if (!base) {
  console.error('usage: node scripts/slowtest-bench.mjs <baseUrl> [--sweep a,b,c] [--size m,n]');
  process.exit(1);
}
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const sweep = flag('--sweep', '5000,8000,10000,12000,15000,20000,26000,30000')
  .split(',')
  .map(Number);
const sizesMb = flag('--size', '').split(',').filter(Boolean).map(Number);

async function timed(label, doFetch) {
  const t0 = performance.now();
  try {
    const res = await doFetch();
    const wall = Math.round(performance.now() - t0);
    const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
    console.log(`${label} status=${res.status} wall=${wall}ms body=${body}`);
  } catch (err) {
    const wall = Math.round(performance.now() - t0);
    console.log(`${label} FETCH-ERROR wall=${wall}ms ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`# timeout sweep against ${base}/api/slowtest`);
for (const ms of sweep) {
  await timed(`GET ms=${String(ms).padStart(5)}`, () => fetch(`${base}/api/slowtest?ms=${ms}`));
}

if (sizesMb.length) {
  console.log(`# body-size sweep (POST)`);
  for (const mb of sizesMb) {
    const body = new Uint8Array(Math.round(mb * 1024 * 1024));
    await timed(`POST ~${mb}MB`, () =>
      fetch(`${base}/api/slowtest`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body,
      })
    );
  }
}
