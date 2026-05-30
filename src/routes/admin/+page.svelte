<script>
  // Access is validated in +page.server.js before this renders, which also
  // builds the invite links so the raw token list never ships as client logic.
  let { data } = $props();
</script>

<main class="admin">
  <h1>Admin</h1>

  <section>
    <h2>Access Tokens</h2>
    {#if data.invites.length === 0}
      <p>No tokens configured.</p>
    {:else}
      <ul class="invites">
        {#each data.invites as invite (invite.token)}
          <li>
            <span class="token">{invite.token}</span>
            <a href={invite.url}>{invite.url}</a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .admin {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1rem;
    font-family: 'Quicksand Variable', sans-serif;
  }

  .invites {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .invites li {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .token {
    font-weight: 600;
  }

  .invites a {
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    word-break: break-all;
  }
</style>
