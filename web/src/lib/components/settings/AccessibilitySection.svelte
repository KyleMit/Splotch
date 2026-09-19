<script lang="ts">
  import ButtonSizeSetting from './ButtonSizeSetting.svelte';
</script>

<!-- The one place a parent looks when their child needs something different:
     each accommodation with one sentence on who it helps. -->
<section class="setting-group">
  <ButtonSizeSetting
    id="accessibilityButtonScaleLabel"
    help="Bigger buttons help small or unsteady hands"
  />
</section>
