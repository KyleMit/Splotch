<script lang="ts">
  import { paletteHex } from '$lib/palette';
  import { HIGHLIGHTS } from './contents';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
</script>

<RuleLabel>The short version</RuleLabel>

<ul class="highlights">
  {#each HIGHLIGHTS as { label, lead, body } (label)}
    <li>
      <span class="chip" aria-hidden="true" style:background={paletteHex(label)}></span>
      <span><strong>{lead}</strong> {body}</span>
    </li>
  {/each}
</ul>

<style>
  /* The headline "no ___" promises, as a bordered checklist whose rows lead
     with crayon chips — the one block that escapes the reading measure and
     fills the sheet. The brand washes are the panel's tint on either paper:
     lavender over the white sheet, a plum-tinted edge over the dark one. */
  .highlights {
    list-style: none;
    max-width: none;
    padding: var(--space-1) 22px;
    margin: 0 0 var(--space-8);
    border: 2px solid var(--brand-wash-hover);
    border-radius: var(--radius-lg);
  }

  .highlights li {
    display: flex;
    gap: 14px;
    align-items: baseline;
    padding: var(--space-3) 0;
    margin: 0;
    border-bottom: var(--border-width) solid var(--brand-wash);
    color: var(--page-body);
  }

  .highlights li:last-child {
    border-bottom: none;
  }

  /* Matches the masthead CrayonStrip's pill proportions, sized up a touch; the
     translate optically centers the chip against the first line's baseline. */
  .highlights .chip {
    flex: 0 0 auto;
    width: 18px;
    height: 8px;
    border-radius: var(--radius-pill);
    transform: translateY(-2px);
  }

  .highlights strong {
    color: var(--page-ink);
  }
</style>
