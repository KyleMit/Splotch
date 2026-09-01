<script lang="ts">
  import { runSingleFlightActivation } from '$lib/actions/pressFeedback';
  import Icon from './Icon.svelte';

  let { onClose }: { onClose: () => void } = $props();

  function closeAfterPressFeedback(event: MouseEvent) {
    void runSingleFlightActivation(event.currentTarget as HTMLButtonElement, onClose);
  }
</script>

<button class="modal-close-btn" aria-label="Close" onclick={closeAfterPressFeedback}>
  <Icon name="close" class="modal-close-icon" />
</button>
