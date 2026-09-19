<script lang="ts">
  import ButtonSizeSetting from './ButtonSizeSetting.svelte';
  import SectionLinkRow from './SectionLinkRow.svelte';
  import '$lib/components/deferredIcons';
</script>

<!-- The one place a parent looks when their child needs something different.
     It holds the accommodations themselves and points at the controls other
     sections already own, with one sentence each on who it helps. -->
<section class="setting-group">
  <ButtonSizeSetting
    id="accessibilityButtonScaleLabel"
    help="Bigger buttons help small or unsteady hands"
  />

  <SectionLinkRow
    section="controls"
    label="Drawing Tools"
    id="accessibilityDrawingToolsLink"
    help="Fewer tools in the drawer gives them less to sort through"
  />

  <SectionLinkRow
    section="sound"
    id="accessibilitySoundLink"
    help="Softer or silent sounds help kids who find noise too much"
  />
</section>
