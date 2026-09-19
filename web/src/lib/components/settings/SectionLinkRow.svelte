<script lang="ts">
  import Icon from '../Icon.svelte';
  import SectionIcon from '../SectionIcon.svelte';
  import { sectionIcon, sectionLabel } from './sections';
  import { uiState, type RequestedSettingsSection } from '$lib/state/ui.svelte';

  // A row that opens another Settings section — the cross-link a section uses
  // to point at a control that lives elsewhere rather than copy it. The icon is
  // the target section's own, so the row reads as that section's hub row would,
  // and the request goes through the same deep link every other surface uses,
  // so it lands the right way in either shell (a drill-in on the phone, a
  // scroll in the wide pane). `help` is the one calm sentence saying who the
  // linked control helps.
  interface Props {
    section: RequestedSettingsSection;
    /** Names the control inside the section when that reads better than the section's own name. */
    label?: string;
    id: string;
    help: string;
  }

  let { section, label = sectionLabel(section), id, help }: Props = $props();

  // Only shown when the row is named after a control inside the section, so
  // the parent can see where the tap takes them.
  const target = $derived(label === sectionLabel(section) ? null : sectionLabel(section));
</script>

<!-- The help line sits inside the button so the whole card is the tap target;
     the accessible name is pinned to the label, and the help stays a
     description rather than joining the name. -->
<button
  type="button"
  class="setting section-link"
  {id}
  aria-labelledby="{id}-label"
  aria-describedby="{id}-help"
  onclick={() => uiState.requestSettingsSection(section)}
>
  <span class="section-link-row">
    <span class="section-link-info">
      <SectionIcon icon={sectionIcon(section)} class="setting-icon" />
      <span class="section-link-label" id="{id}-label">{label}</span>
    </span>
    <span class="section-link-target">
      {#if target}<span>{target}</span>{/if}
      <Icon name="chevron-right" class="section-link-chevron" />
    </span>
  </span>
  <span id="{id}-help" class="section-link-help">{help}</span>
</button>

<style>
  /* The card itself is the button: it wears the shell's `.setting` chrome (the
     shell styles that class on any element) and the same row anatomy as
     ToggleRow — icon column, label, trailing control — so a link sits flush
     with the toggles around it, and every point of the card, help line
     included, is the tap target. */
  .section-link {
    display: block;
    width: 100%;
    min-height: 44px;
    border: none;
    font-family: inherit;
    text-align: left;
    color: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  .section-link-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .section-link-info {
    display: flex;
    align-items: center;
    gap: var(--setting-icon-gap);
    min-width: 0;
  }

  .section-link-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text);
  }

  .section-link-target {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .section-link :global(.section-link-chevron) {
    width: 18px;
    height: 18px;
    fill: var(--icon-muted);
  }

  /* Mirrors ToggleRow's help line: --text-soft is pinned to hold 4.5:1 for
     this small text on --surface-2. */
  .section-link-help {
    display: block;
    margin: 6px 0 0 var(--setting-indent);
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.4;
  }
</style>
