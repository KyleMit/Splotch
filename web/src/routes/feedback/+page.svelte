<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import ReportFields from '$lib/components/report/ReportFields.svelte';
  import type { DeviceInfo } from '$lib/deviceReport';
  import type { ReportKind } from '$lib/report';
  import type { PageProps } from './$types';

  // The shareable half of the Parent Center's Send Feedback section: same fields
  // (ReportFields), same server core ($lib/server/report), reached by a URL that
  // can go in the Play Store listing instead of behind the in-app modal. It
  // posts to a form action rather than /api/report so a report still sends with
  // JavaScript unavailable — the one thing the in-app form can't offer.
  let { form }: PageProps = $props();

  let kind = $state<ReportKind>('bug');
  let message = $state('');
  let includeDevice = $state(false);
  let device = $state<DeviceInfo | null>(null);
  let honeypot = $state('');
  let submitting = $state(false);

  const submit: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      // The fields are bound to the state above, so letting SvelteKit reset the
      // <form> element would leave the DOM and that state disagreeing.
      await update({ reset: false });
      submitting = false;
    };
  };
</script>

<svelte:head>
  <title>Send Feedback · Splotch</title>
  <meta
    name="description"
    content="Report a bug or suggest an idea for Splotch, the drawing app for toddlers. No account needed."
  />
</svelte:head>

<PageShell title="Send us feedback" wordmark="Splotch feedback">
  {#snippet lede()}
    Found a bug or have an idea? Tell us here — it goes straight to our issue tracker. No account,
    no sign-up, and nothing to install.
  {/snippet}

  <RuleLabel>{form?.ok ? 'All done' : 'Your report'}</RuleLabel>

  {#if form?.ok}
    <div class="done">
      <h2>Thank you — your report is in.</h2>
      <p>
        A real person reads every one of these. There's no account attached to it, so we can't write
        back directly; the issue itself is where any follow-up questions will appear.
      </p>
      <div class="done-actions">
        {#if form.url}
          <a class="done-link" href={form.url} target="_blank" rel="noopener noreferrer">
            View your report ↗
          </a>
        {/if}
        <a class="done-again" href="/feedback">Send another</a>
      </div>
    </div>
  {:else}
    <div class="layout">
      <form class="card" method="POST" use:enhance={submit}>
        <ReportFields bind:kind bind:message bind:includeDevice bind:device bind:honeypot />

        <!-- Not the Button primitive: that one is sized for a modal's settings
             card, and this page's call to action is the same solid, generously
             padded shape the beta page's step buttons wear, so the two
             standalone pages read as one set. -->
        <button class="submit" type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send report'}
        </button>

        {#if form?.error}
          <StatusMessage status="error">{form.error}</StatusMessage>
        {/if}
      </form>

      <aside class="aside">
        <h2>What happens next</h2>
        <ol>
          <li>Your note opens an issue on our public GitHub tracker.</li>
          <li>We read it, and it joins the list of things to fix or build.</li>
          <li>Nothing else is collected — see the <a href="/privacy">privacy policy</a>.</li>
        </ol>
      </aside>
    </div>
  {/if}
</PageShell>

<style>
  /* Desktop puts the note beside the form rather than under it, so the whole
     page is one screen; the form keeps a comfortable reading measure instead of
     stretching to the sheet's full 880px. */
  .layout {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 32px;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1 1 380px;
    max-width: var(--page-measure);
  }

  .submit {
    align-self: flex-start;
    margin-top: 4px;
    padding: 15px 24px;
    border: none;
    border-radius: 14px;
    background: var(--page-accent);
    color: var(--page-on-accent);
    font-family: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .submit:active:not(:disabled) {
    transform: scale(0.97);
  }

  .submit:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .aside {
    flex: 0 1 250px;
    min-width: 0;
  }

  .aside h2 {
    margin: 0 0 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  .aside ol {
    margin: 0;
    padding-left: 1.1em;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .aside li {
    font-size: 15px;
    font-weight: 500;
    line-height: 1.55;
    color: var(--page-body);
  }

  .done {
    max-width: var(--page-measure);
  }

  .done h2 {
    margin: 0;
    font-size: 21px;
    font-weight: 700;
    color: var(--page-ink);
  }

  .done p {
    margin: 12px 0 0;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.65;
    color: var(--page-body);
  }

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    margin-top: 24px;
  }

  /* The same solid affordance the beta page's step buttons wear, so the two
     standalone pages offer one button shape between them. */
  .done-link {
    display: inline-block;
    padding: 15px 24px;
    border-radius: 14px;
    background: var(--page-accent);
    color: var(--page-on-accent);
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    transition:
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .done-link:active {
    transform: scale(0.97);
  }

  .done-again,
  .aside a {
    color: var(--page-link);
    font-weight: 600;
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .submit:hover:not(:disabled),
    .done-link:hover {
      background: var(--page-accent-hover);
    }

    .done-again:hover,
    .aside a:hover {
      text-decoration-thickness: 2px;
    }
  }

  @media (max-width: 700px) {
    /* Below this the aside would be a 250px column beside a squeezed form, so
       it drops under it — and after the form, since it describes what happens
       once the report is sent. */
    .aside {
      flex: 1 1 100%;
    }
  }

  @media (max-width: 540px) {
    .done h2 {
      font-size: 19px;
    }

    .done p,
    .aside li {
      font-size: 15px;
    }

    /* Full-width tap target, matching the beta page's step buttons. */
    .done-actions {
      gap: 12px;
    }

    .done-link,
    .submit {
      flex: 1 0 100%;
      width: 100%;
      min-height: 48px;
      text-align: center;
    }
  }
</style>
