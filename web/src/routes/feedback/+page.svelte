<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import ReportFields from '$lib/components/report/ReportFields.svelte';
  import type { ReportKind } from '$lib/report';
  import type { PageProps } from './$types';

  // The shareable half of the Parent Center's Send Feedback section: same fields
  // (ReportFields), same server core ($lib/server/report), reached by a URL that
  // can go in the Play Store listing instead of behind the in-app modal. It
  // posts to a form action rather than /api/report so a report still sends with
  // JavaScript unavailable — the one thing the in-app form can't offer.
  let { data, form }: PageProps = $props();

  // Seeded from the failed submission so a browser with no JavaScript — which
  // re-renders this page from scratch on every POST — hands the reporter back
  // what they wrote instead of an empty box. Deliberately the INITIAL value
  // only: with `use:enhance` the component never remounts, so re-seeding from a
  // later `form` would overwrite whatever the reporter has since typed.
  // svelte-ignore state_referenced_locally
  let kind = $state<ReportKind>(form?.values.kind ?? 'bug');
  // svelte-ignore state_referenced_locally
  let message = $state(form?.values.message ?? '');
  // svelte-ignore state_referenced_locally
  let includeDevice = $state(form?.values.includeDevice ?? false);
  let submitting = $state(false);

  // Sent and unsent are two states of one page, not one page with a banner: the
  // hero carries the outcome, so a reporter who just submitted isn't re-invited
  // to submit by a 46px "Send us feedback" above the thank-you. It comes from
  // the redirected URL rather than the action's return value (see +page.server),
  // so a reload of the thank-you can't re-post the report.
  let sent = $derived(data.sent);

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

{#snippet nextSteps()}
  <aside class="aside">
    <h2>What happens next</h2>
    <ol>
      <li>Your note opens an issue on our public GitHub tracker.</li>
      <li>We read it, and it joins the list of things to fix or build.</li>
      <li>Nothing else is collected — see the <a href="/privacy">privacy policy</a>.</li>
    </ol>
  </aside>
{/snippet}

<PageShell
  title={sent ? 'Thank you — your report is in.' : 'Send us feedback'}
  wordmark="Splotch feedback"
>
  {#snippet lede()}
    {#if sent}
      A real person reads every one of these. There's no account attached to it, so we can't write
      back directly — the issue itself is where any follow-up questions will appear.
    {:else}
      Found a bug or have an idea? Tell us here — it goes straight to our issue tracker. No account,
      no sign-up, and nothing to install.
    {/if}
  {/snippet}

  <RuleLabel>{sent ? 'What happens now' : 'Your report'}</RuleLabel>

  {#if sent}
    <div class="done">
      <StatusMessage status="success">Your report was sent.</StatusMessage>
      <div class="done-actions">
        {#if data.sentIssueUrl}
          <a class="done-link" href={data.sentIssueUrl} target="_blank" rel="noopener noreferrer">
            View your report ↗
          </a>
        {/if}
        <a class="done-again" href="/feedback">Send another</a>
      </div>
      {@render nextSteps()}
    </div>
  {:else}
    <div class="layout">
      <form class="card" method="POST" use:enhance={submit}>
        <ReportFields bind:kind bind:message bind:includeDevice />

        <!-- Above the button, not below it: the reporter's eye is on the control
             they just pressed, and an error under a full-width button on a phone
             lands at or past the fold. -->
        {#if form?.error}
          <StatusMessage status="error">{form.error}</StatusMessage>
        {/if}

        <!-- Not the Button primitive: that one is sized for a modal's settings
             card, and this page's call to action is the same solid, generously
             padded shape the beta page's step buttons wear, so the two
             standalone pages read as one set. -->
        <button class="submit" type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send report'}
        </button>
      </form>

      {@render nextSteps()}
    </div>
  {/if}
</PageShell>

<style>
  /* Wide desktops put the note beside the form; anything narrower stacks, since
     a fixed 250px rail beside a squeezed form wraps its own sentences and leaves
     the short page bottom-heavy with empty sheet. */
  .layout {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 32px;
  }

  /* The form sits on its own panel, exactly as it does inside the Parent Center:
     ReportFields' inputs are --surface, so without a --surface-2 ground under
     them a white field on a white sheet is separated only by a hairline and the
     whole form reads as unstyled. */
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1 1 380px;
    max-width: var(--page-measure);
    padding: 20px;
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  /* The page's own type scale, not the modal's: inside a settings card the
     prompt is a 14px label among many, but here it is the one question the
     visitor came to answer. */
  .card :global(.report-label) {
    font-size: 17px;
    font-weight: 700;
    color: var(--page-ink);
  }

  .card :global(.report-kind-option) {
    font-size: 15px;
    padding: 10px 12px;
  }

  .card :global(.report-public-note) {
    font-size: 13px;
  }

  /* Three radii on the page, one family: 22 the sheet, 14 the buttons and the
     control they sit in, 12 the fields. */
  .card :global(.report-kind) {
    border-radius: 14px;
  }

  .card :global(.report-kind-option) {
    border-radius: 11px;
  }

  .card :global(.report-textarea),
  .card :global(.report-device-details) {
    border-radius: var(--radius-md);
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

  /* A callout in the step ledger's language rather than three lines floating in
     the corner — the same left-ruled, washed block /android-beta closes each
     step with, so the two pages share a second element besides the button. */
  .aside {
    flex: 0 1 250px;
    min-width: 0;
    padding: 14px 18px;
    border-left: 3px solid var(--brand);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    background: var(--brand-wash);
  }

  .aside h2 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--page-ink);
  }

  .aside ol {
    margin: 0;
    padding-left: 1.1em;
    display: flex;
    flex-direction: column;
    gap: 8px;
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

  .done-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    margin: 24px 0 32px;
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

  /* The rail only earns its place when the form beside it is still comfortable.
     Below this it drops under the form — after it, since it describes what
     happens once the report is sent. */
  @media (max-width: 1024px) {
    .aside {
      flex: 1 1 100%;
      max-width: var(--page-measure);
    }
  }

  @media (max-width: 540px) {
    .aside li {
      font-size: 15px;
    }

    .card {
      padding: 16px;
    }

    /* Full-width tap target, matching the beta page's step buttons. */
    .done-actions {
      gap: 12px;
    }

    .done-link {
      flex: 1 0 100%;
      text-align: center;
    }

    .done-link,
    .submit {
      width: 100%;
      min-height: 48px;
    }
  }
</style>
