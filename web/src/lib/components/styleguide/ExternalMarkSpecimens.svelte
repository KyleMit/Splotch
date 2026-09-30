<script lang="ts">
  import ExternalMark from '$lib/components/design/ExternalMark.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { GITHUB_REPO_URL } from '$lib/githubRepo';
  import { primitiveSections } from './primitiveSections';
  import '$lib/components/deferredIcons';
</script>

<h3 id={primitiveSections.externalMark.id} data-sg-section>
  External mark <code class="file-path">design/ExternalMark.svelte</code>
</h3>
<p class="sub-intro">
  The paint blob that ends every link opening outside Splotch, so a grown-up sees it leave the app
  before the parental gate asks. It goes inside the <code>&lt;a&gt;</code>, straight after the
  label, and adds “(opens outside Splotch)” to the link's name. <code>inline</code> takes the link's
  ink in running prose; <code>standalone</code> sits muted beside an icon-led link on its own line.
  Filled buttons and
  <code>mailto:</code> links go without.
</p>
<p class="external-demo-prose">
  Read the <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer"
    >source on GitHub<ExternalMark variant="inline" /></a
  >, where every line of this page lives.
</p>
<p class="external-demo-standalone">
  <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
    <Icon name="github" class="external-demo-icon" aria-hidden="true" />
    View on GitHub<ExternalMark variant="standalone" />
  </a>
</p>

<style>
  h3 {
    margin: 22px 0 var(--space-1);
  }

  code {
    white-space: nowrap;
  }

  .file-path {
    font-weight: 400;
  }

  .sub-intro {
    max-width: 62ch;
    margin: 0 0 10px;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .external-demo-prose {
    margin: 0 0 var(--space-2);
    color: var(--text);
  }

  .external-demo-prose a {
    color: var(--brand-text);
    font-weight: var(--font-weight-semibold);
  }

  /* Settings › About's link, restated so the muted variant reads in context. */
  .external-demo-standalone a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-decoration: none;
  }

  .external-demo-standalone :global(.external-demo-icon) {
    width: 20px;
    height: 20px;
  }

  .external-demo-standalone :global(.external-demo-icon svg) {
    fill: var(--icon-muted);
  }
</style>
