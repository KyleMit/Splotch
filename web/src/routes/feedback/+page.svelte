<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import ReportFields from '$lib/components/report/ReportFields.svelte';
  import type { ReportKind } from '$lib/report';
  import { supportEmail } from '$lib/supportEmail';
  import type { PageProps } from './$types';

  // The shareable half of Settings' Send Feedback section: same fields
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

  // Offered only alongside a failure, so the address never reaches a document a
  // crawler could fetch: this block renders in an action's POST response (or,
  // with use:enhance, client-side after one), and a GET of /feedback has no
  // `form`. That is why it can be composed on the server here while
  // /beta — a prerendered GET — has to wait for hydration.
  const supportHref = `mailto:${supportEmail()}?subject=${encodeURIComponent('Splotch feedback')}`;

  // Being copied and pasted is this page's whole purpose, and the post-submit
  // URL is the one a reporter has in front of them when they go to pass the
  // link on — so drop the query once the confirmation is on screen. Left alone,
  // /feedback?sent=1 hands the next person a thank-you for someone else's
  // report with no form anywhere on the page.
  //
  // Plain history.replaceState, like the ?v= strip in pwa/updates.ts: nothing
  // here reads page.url (the view comes from `data`, resolved before this runs),
  // so there is no router state to keep in step. A reload after the strip lands
  // on the form, which is the right page for whoever reloads.
  $effect(() => {
    if (sent) history.replaceState(null, '', '/feedback');
  });

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
      <li>Your note opens a private support issue that only the Splotch maintainer can read.</li>
      <li>We read it, and it joins the list of things to fix or build.</li>
      <li>Nothing else is collected — see the <a href="/privacy">privacy policy</a>.</li>
    </ol>
  </aside>
{/snippet}

<PageShell title={sent ? 'Thank you — your report is in.' : 'Send us feedback'} wordmark="Splotch">
  {#snippet lede()}
    {#if sent}
      A real person reads every one of these. There's no account attached to it, so we can't write
      back directly, but every report is reviewed.
    {:else}
      Found a bug or have an idea? Tell us here — it opens a private support issue that only the
      Splotch maintainer can read. No account, no sign-up, and nothing to install.
    {/if}
  {/snippet}

  {#if sent}
    <div class="done">
      <StatusMessage status="success">Your report was sent.</StatusMessage>
      <div class="done-actions">
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
          <StatusMessage status="error">
            {form.error}
            <span class="fallback">
              You can also email it to <a class="fallback-link" href={supportHref}
                >{supportEmail()}</a
              > instead — we read that too.
            </span>
          </StatusMessage>
        {/if}

        <!-- Not the Button primitive: that one is sized for a modal's settings
             card, and this page's call to action is the same solid, generously
             padded shape the beta page's step buttons wear, so the two
             standalone pages read as one set. -->
        <button class="submit" type="submit" disabled={submitting}>
          {submitting ? 'Sending…' : kind === 'bug' ? 'Send report' : 'Send idea'}
        </button>
      </form>

      {@render nextSteps()}
    </div>
  {/if}

  <ScrollCue />
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

  /* No fill of its own: ground → sheet → form panel was three surfaces deep,
     and the lavender callout should be the page's only tinted one. The fields
     carry their own borders. */
  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1 1 380px;
    max-width: var(--page-measure);
  }

  /* The page's own type scale, not the modal's: inside a settings card the
     prompt is a 14px label among many, but here it is the one question the
     visitor came to answer. */
  .card :global(.report-label) {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  .card :global(.report-privacy-note) {
    font-size: var(--font-size-sm);
  }

  /* Three radii on the page, one family: the sheet on xl, the buttons, fields,
     and the kind control on md, its nested options one step in on sm. The
     picker primitive already lands on that family; these two don't. */
  .card :global(.report-textarea),
  .card :global(.report-device-details) {
    border-radius: var(--radius-md);
  }

  .submit {
    align-self: flex-start;
    margin-top: 4px;
    padding: 15px 24px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--page-accent);
    color: var(--page-on-accent);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
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
     the corner — the same left-ruled, washed block /beta closes each
     step with, so the two pages share a second element besides the button. */
  /* Its own line inside the banner: the error is one sentence and the way out is
     another, and running them together reads as a single long apology. */
  .fallback {
    display: block;
    margin-top: 6px;
  }

  .fallback-link {
    color: inherit;
    font-weight: var(--font-weight-bold);
    text-decoration: underline;
    /* The address is the one string here a reporter may have to read out or
       retype, so it never breaks mid-word. */
    white-space: nowrap;
  }

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
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
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
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
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

  .done-again,
  .aside a {
    color: var(--page-link);
    font-weight: var(--font-weight-semibold);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .submit:hover:not(:disabled) {
      background: var(--page-accent-hover);
    }

    .done-again:hover,
    .aside a:hover {
      text-decoration-thickness: 2px;
    }
  }

  /* The rail only earns its place when the form beside it is still comfortable.
     Below this the page is one column, so both fill the sheet: a measure-capped
     column inside a much wider sheet reads as left-aligned with a lopsided
     gutter, not as a centered page. */
  @media (max-width: 1024px) {
    .card,
    .done {
      max-width: none;
    }

    .aside {
      flex: 1 1 100%;
    }
  }

  @media (max-width: 540px) {
    .card {
      gap: 12px;
    }

    /* Full-width tap target, matching the beta page's step buttons. */
    .done-actions {
      gap: 12px;
    }

    .submit {
      width: 100%;
      min-height: 48px;
    }
  }
</style>
