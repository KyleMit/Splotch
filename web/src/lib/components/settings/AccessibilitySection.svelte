<script lang="ts">
  import ButtonSizeSetting from './ButtonSizeSetting.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import { reducedMotion, setReducedMotion } from '$lib/state/appearance.svelte';
  import { settingsState, setColorBlindFriendly } from '$lib/state/settings.svelte';
  import { selectPaletteColor } from '$lib/state/colors.svelte';
  import { activePalette } from '$lib/state/activePalette.svelte';

  // The selected swatch may not exist in the other palette, so switching
  // returns the selection to the palette's default (index 0).
  function toggleColorBlindFriendly(v: boolean) {
    setColorBlindFriendly(v);
    selectPaletteColor(activePalette()[0].hex);
  }
  import '$lib/components/deferredIcons';
</script>

<!-- The one place a parent looks when their child needs something different:
     each accommodation with one sentence on who it helps. -->
<section class="setting-group">
  <ButtonSizeSetting />
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
  <div class="setting">
    <ToggleRow
      icon="more-colors"
      label="Color-blind friendly colors"
      id="colorBlindFriendlyToggle"
      checked={settingsState.colorBlindFriendlyEnabled}
      onToggle={toggleColorBlindFriendly}
      help="Crayons and picker colors that stay distinct for red-green and blue-yellow color blindness"
    />
  </div>
</section>
