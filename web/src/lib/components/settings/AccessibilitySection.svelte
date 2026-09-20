<script lang="ts">
  import ButtonSizeSetting from './ButtonSizeSetting.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import { reducedMotion, setReducedMotion } from '$lib/state/appearance.svelte';
  import '$lib/components/deferredIcons';
</script>

<!-- The one place a parent looks when their child needs something different:
     each accommodation with one sentence on who it helps. -->
<section class="setting-group">
  <ButtonSizeSetting
    id="accessibilityButtonScaleLabel"
    help="Bigger buttons help small or unsteady hands"
  />
  <!-- The switch shows the effective answer, so it reads as on when only the
       device's own setting asks for reduced motion. -->
  <div class="setting">
    <ToggleRow
      icon="reduce-motion"
      label="Reduce Motion"
      id="reduceMotionToggle"
      checked={reducedMotion()}
      onToggle={setReducedMotion}
      help="Calmer screens help children who are sensitive to movement"
    />
  </div>
</section>
