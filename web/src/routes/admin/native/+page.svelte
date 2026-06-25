<script lang="ts">
  import { onMount } from 'svelte';
  import AdminConsole, { type Flash, type Invite } from '$lib/components/admin/AdminConsole.svelte';
  import { apiUrl } from '$lib/api';
  import { saveAdminSession, loadAdminSession, clearAdminSession } from '$lib/secureStorage';
  import { setAdminLinkVisible } from '$lib/state/settings.svelte';

  // API-backed twin of /admin for the native apps, whose static bundle has no
  // server to run the form actions. Same console UI, but auth rides as a
  // bearer header against the hosted /api/admin endpoints (apiUrl points them
  // at https://splotch.art; on the web this page talks to the same-origin API,
  // so it also works under plain `vite dev`). The bearer credential is the
  // derived session token from /api/admin/login — never the raw secret — and
  // it lives in the platform secure store (Keychain/Keystore on device).
  let session = $state('');
  let authed = $state(false);
  let invites = $state<Invite[]>([]);
  let flash = $state<Flash | null>(null);
  let loginError = $state<string | null>(null);
  // Don't flash the login form while the stored session is still being checked.
  let ready = $state(false);

  function signOutLocally(message: string | null = null) {
    session = '';
    authed = false;
    invites = [];
    loginError = message;
    setAdminLinkVisible(false);
    void clearAdminSession();
  }

  async function authedFetch(method: string, body?: { token: string }) {
    return fetch(apiUrl('/api/admin/tokens'), {
      method,
      headers: {
        Authorization: `Bearer ${session}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // Every /api/admin/tokens response carries the full { tokens, invites }
  // snapshot, so one handler covers list/add/remove. A 401 means the session
  // was invalidated server-side (secret rotated) — drop back to the login form.
  async function applySnapshot(response: Response) {
    if (response.status === 401) {
      signOutLocally('Your session has expired. Please sign in again.');
      return false;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      flash = { kind: 'error', text: data?.error ?? 'Something went wrong. Please try again.' };
      return false;
    }
    invites = data.invites;
    authed = true;
    return true;
  }

  onMount(async () => {
    const stored = await loadAdminSession();
    if (stored) {
      session = stored;
      try {
        await applySnapshot(await authedFetch('GET'));
      } catch {
        // Offline or the API is unreachable — keep the stored session and show
        // the login card with a hint rather than discarding a valid credential.
        loginError = 'Could not reach the server. Check your connection and sign in again.';
      }
    }
    // Mirror /admin's behavior for the About-tab link: it stays visible exactly
    // while a session credential is present, valid or not.
    setAdminLinkVisible(Boolean(stored));
    ready = true;
  });

  async function login(key: string) {
    loginError = null;
    let response: Response;
    try {
      response = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
    } catch {
      loginError = 'Could not reach the server. Check your connection.';
      return false;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || typeof data?.session !== 'string') {
      loginError = data?.error ?? 'Sign in failed.';
      return false;
    }
    session = data.session;
    await saveAdminSession(session);
    setAdminLinkVisible(true);
    return applySnapshot(await authedFetch('GET'));
  }

  async function mutate(method: 'POST' | 'DELETE', token: string, message: string) {
    flash = null;
    try {
      if (await applySnapshot(await authedFetch(method, { token }))) {
        flash = { kind: 'success', text: message };
        return true;
      }
    } catch {
      flash = { kind: 'error', text: 'Could not reach the server. Check your connection.' };
    }
    return false;
  }
</script>

{#if ready}
  <AdminConsole
    {authed}
    {invites}
    {flash}
    {loginError}
    onlogin={login}
    onlogout={async () => signOutLocally()}
    onadd={(token) => mutate('POST', token, `Added “${token}”`)}
    onremove={async (token) => {
      await mutate('DELETE', token, `Removed “${token}”`);
    }}
  />
{/if}
