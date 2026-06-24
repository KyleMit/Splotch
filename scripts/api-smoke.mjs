#!/usr/bin/env node
// Self-contained smoke test for the /api/* HTTP contract (see the `api` skill).
// Boots a throwaway `vite dev` with test env, exercises the admin auth flow and a
// public oracle against the documented shapes, then tears the server down.
// No Gemini key or Netlify Blobs needed — generate-image and verify-key (which make
// live model calls) are intentionally out of scope.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './lib/utils.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;
const ADMIN_SECRET = randomUUID();
const SEED_TOKENS = 'alpha,beta';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
	if (ok) {
		passed++;
		console.log(`  ✓ ${name}`);
	} else {
		failed++;
		console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
	}
}

async function json(res) {
	try {
		return await res.json();
	} catch {
		return null;
	}
}

async function waitForServer(timeoutMs = 45_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			// Unauthenticated GET should answer 401 once routes are live.
			const res = await fetch(`${BASE}/api/admin/tokens`);
			if (res.status === 401) return;
		} catch {
			// server not up yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`dev server did not become ready on ${BASE} within ${timeoutMs}ms`);
}

async function run() {
	// --- admin/login ---
	const wrong = await fetch(`${BASE}/api/admin/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key: 'definitely-wrong' })
	});
	const wrongBody = await json(wrong);
	check('login with wrong key → 403 {ok:false}', wrong.status === 403 && wrongBody?.ok === false, `got ${wrong.status}`);

	const good = await fetch(`${BASE}/api/admin/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key: ADMIN_SECRET })
	});
	const goodBody = await json(good);
	const session = goodBody?.session;
	check(
		'login with correct key → 200 {ok:true, session:<64-hex>}',
		good.status === 200 && goodBody?.ok === true && /^[a-f0-9]{64}$/.test(session ?? ''),
		`got ${good.status}`
	);

	const auth = { Authorization: `Bearer ${session}` };

	// --- admin/tokens auth gate ---
	const noAuth = await fetch(`${BASE}/api/admin/tokens`);
	check('tokens without auth → 401', noAuth.status === 401, `got ${noAuth.status}`);

	const badAuth = await fetch(`${BASE}/api/admin/tokens`, { headers: { Authorization: 'Bearer deadbeef' } });
	check('tokens with bad bearer → 401', badAuth.status === 401, `got ${badAuth.status}`);

	// --- tokens snapshot + mutations ---
	const list = await fetch(`${BASE}/api/admin/tokens`, { headers: auth });
	const listBody = await json(list);
	check(
		'tokens GET → 200 {ok, tokens[], invites[]}',
		list.status === 200 && listBody?.ok === true && Array.isArray(listBody?.tokens) && Array.isArray(listBody?.invites),
		`got ${list.status}`
	);
	// vite dev has no Netlify Blobs, so the snapshot must report the in-memory
	// fallback. The deployed counterpart (scripts/blobs-smoke.mjs) asserts the
	// opposite — persistent:true — against a real function.
	check('tokens GET → persistent:false under vite dev', listBody?.persistent === false, `got ${listBody?.persistent}`);

	const newToken = `smoke-${Date.now()}`;
	const add = await fetch(`${BASE}/api/admin/tokens`, {
		method: 'POST',
		headers: { ...auth, 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: newToken })
	});
	const addBody = await json(add);
	check('tokens POST adds a token', add.status === 200 && addBody?.tokens?.includes(newToken), `got ${add.status}`);

	const del = await fetch(`${BASE}/api/admin/tokens`, {
		method: 'DELETE',
		headers: { ...auth, 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: newToken })
	});
	const delBody = await json(del);
	check('tokens DELETE removes the token', del.status === 200 && !delBody?.tokens?.includes(newToken), `got ${del.status}`);

	// --- public oracle: shape only (no allowlist config required) ---
	const code = await fetch(`${BASE}/api/verify-access-code`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ code: 'almost-certainly-not-a-real-code' })
	});
	const codeBody = await json(code);
	check('verify-access-code → 200 {ok:boolean}', code.status === 200 && typeof codeBody?.ok === 'boolean', `got ${code.status}`);
}

let server;
try {
	console.log('Starting test dev server…');
	server = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], {
		cwd: join(ROOT, 'web'),
		env: { ...process.env, ADMIN_ACCESS_TOKEN: ADMIN_SECRET, ALLOWED_TOKENS_LIST: SEED_TOKENS },
		stdio: ['ignore', 'ignore', 'inherit']
	});

	await waitForServer();
	console.log(`Server ready on ${BASE}\n`);
	await run();
} catch (err) {
	failed++;
	console.error(`\nFATAL: ${err.message}`);
} finally {
	if (server) server.kill('SIGTERM');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
