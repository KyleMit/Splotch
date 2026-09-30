<script lang="ts">
  import Icon from '../Icon.svelte';
  import VisuallyHidden from './VisuallyHidden.svelte';
  import '$lib/components/deferredIcons';

  // The "leaves the app" cue, rendered inside the outbound <a> after its label
  // so a grown-up sees the link leaves Splotch before the parental gate asks,
  // and a screen reader hears it in the link's name. Inside the anchor, it is
  // part of the tap target and the focus ring, and the gate actions and native
  // target handling on the anchor see no difference.
  //
  // `standalone` sits beside an icon-led link on its own line (Settings ›
  // About); `inline` sits in running prose and takes the link's own ink.
  // data-external-mark lets the privacy policy's revision hash leave this
  // chrome out of the policy text (policyRevisionsTestHarness.ts).
  let { variant }: { variant: 'inline' | 'standalone' } = $props();
</script>

<!-- An icon, not a "↗" glyph: the Quicksand subsets would drop U+2197 to the
     OS font at its own weight, as BackLink's arrow did. The word joiner keeps
     the blob from wrapping onto a line of its own; it sits in the hidden
     wrapper rather than beside it so it stays out of the link's name. -->
<span class="external-mark" data-external-mark
  ><span aria-hidden="true"
    >&#8288;<span class={['blob', variant]}
      ><Icon name="external" class="external-mark-icon" /></span
    ></span
  ><VisuallyHidden>(opens outside Splotch)</VisuallyHidden></span
>

<style>
  .external-mark {
    white-space: nowrap;
  }

  .blob {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-blob);
  }

  .inline {
    width: 16px;
    height: 16px;
    margin-left: var(--space-1);
    /* Sits on the x-height of the prose around it rather than the baseline. */
    vertical-align: -0.15em;
    background-color: var(--brand-wash);
  }

  .inline :global(.external-mark-icon) {
    width: 9px;
    height: 9px;
  }

  .inline :global(.external-mark-icon svg) {
    fill: currentColor;
  }

  /* The host link is already inline-flex with its own gap; this tops it up. */
  .standalone {
    width: 22px;
    height: 22px;
    margin-left: 2px;
    background-color: var(--external-mark-wash);
  }

  .standalone :global(.external-mark-icon) {
    width: 12px;
    height: 12px;
  }

  /* Muted like the icon that leads the same link, and hovering to full ink
     with it. */
  .standalone :global(.external-mark-icon svg) {
    fill: var(--icon-muted);
    transition: fill var(--duration-base) ease;
  }

  @media (hover: hover) {
    :global(a:hover) > .external-mark .standalone :global(.external-mark-icon svg) {
      fill: var(--icon-ink);
    }
  }
</style>
