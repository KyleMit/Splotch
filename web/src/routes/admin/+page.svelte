<script lang="ts">
  import { applyAction, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import AdminConsole from '$lib/components/admin/AdminConsole.svelte';
  import { setAdminLinkVisible } from '$lib/state/settings.svelte';
  import type { PageData, ActionData } from './$types';

  // `data.authed` tells us whether the request carried a valid admin session
  // cookie. When false we render a login form; otherwise the tokens and prebuilt
  // invite links arrive via `data`. The secret never reaches the client.
  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Keep the public /admin link (in the About tab) in sync with reality: it
  // stays visible exactly while an admin_session cookie is present. Logging in
  // sets the cookie (→ visible); logging out, a failed login, or arriving/leaving
  // without one all resolve to no cookie (→ hidden). `data.hasSession` re-reads
  // on every load, including the redirects that follow login and logout.
  $effect(() => {
    setAdminLinkVisible(data.hasSession);
  });

  // The console UI is shared with /admin/native; this page binds its callbacks
  // to the server form actions so auth stays in the HTTP-only cookie. Each
  // callback POSTs FormData to the action and feeds the result through
  // `applyAction` (SvelteKit's documented programmatic-submission pattern),
  // which follows the login/logout redirects and updates the `form` prop —
  // identical behavior to the `use:enhance` forms this replaces.
  async function submit(action: string, fields: Record<string, string> = {}) {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.append(name, value);
    const response = await fetch(action, {
      method: 'POST',
      headers: { 'x-sveltekit-action': 'true' },
      body
    });
    const result = deserialize(await response.text());
    if (result.type === 'success') await invalidateAll();
    await applyAction(result);
    return result.type === 'success' || result.type === 'redirect';
  }

  let flash = $derived(
    form?.error
      ? { kind: 'error' as const, text: form.error }
      : form?.message
        ? { kind: 'success' as const, text: form.message }
        : null
  );
</script>

<AdminConsole
  authed={data.authed}
  invites={data.invites}
  persistent={data.persistent}
  {flash}
  loginError={form?.loginError ?? null}
  onlogin={(key) => submit('?/login', { 'access-key': key })}
  onlogout={async () => {
    await submit('?/logout');
  }}
  onadd={(token) => submit('?/add', { token })}
  onremove={async (token) => {
    await submit('?/remove', { token });
  }}
/>
