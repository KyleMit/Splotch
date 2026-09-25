<script lang="ts">
  import Disclosure from '../design/Disclosure.svelte';
  import { parentalGateLink } from '$lib/actions/parentalGateLink';
</script>

<div class="openai-key-howto">
  <Disclosure class="byok-howto">
    {#snippet summary()}How do I get an OpenAI API key?{/snippet}
    <ol>
      <li>
        Open <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          use:parentalGateLink>the OpenAI API keys page</a
        >.
      </li>
      <li>Sign in, or create an OpenAI account.</li>
      <li>
        Under <strong>Settings → Organization</strong>, finish
        <strong>verification</strong>. OpenAI requires it before any key can make pictures. Do this
        <em>before</em> the next step — a key made without it saves here perfectly and then fails when
        the picture button is tapped.
      </li>
      <li>
        Click <strong>Create new secret key</strong>, then copy it (it starts with
        <code>sk-…</code>) and paste it below. You only get to see it once.
      </li>
    </ol>
    <p class="byok-howto-note">
      OpenAI bills picture-making usage to your account at its own rates, and requires the account
      to have billing set up before a key can make pictures. Sent an access code by us instead?
      Paste that in the same box — it works there too.
    </p>
  </Disclosure>
</div>

<style>
  /* The how-to's own chrome on the Disclosure primitive — reached with
     :global() because the class lands on the primitive's own markup. */
  .openai-key-howto :global(.byok-howto) {
    margin: 0 0 14px;
    background: var(--surface);
  }

  .openai-key-howto :global(.byok-howto summary) {
    padding: 10px 12px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--brand-text);
  }

  .openai-key-howto :global(.byok-howto ol) {
    margin: 0;
    padding: 0 16px 8px 32px;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.7;
  }

  .openai-key-howto :global(.byok-howto a) {
    color: var(--brand-text);
    font-weight: var(--font-weight-semibold);
  }

  .openai-key-howto :global(.byok-howto code) {
    background: var(--brand-wash);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    font-size: var(--font-size-xs);
  }

  .byok-howto-note {
    margin: 0;
    padding: 0 12px 12px;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }
</style>
