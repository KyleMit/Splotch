<script lang="ts">
  import { waitForPressFeedbackToSettle } from '$lib/actions/pressFeedback';
  import Icon from './Icon.svelte';

  let { onClose }: { onClose: () => void } = $props();

  async function closeAfterPressFeedback(event: MouseEvent) {
    await waitForPressFeedbackToSettle(event.currentTarget as HTMLButtonElement);
    onClose();
  }
</script>

<button class="modal-close-btn" aria-label="Close" onclick={closeAfterPressFeedback}>
  <Icon name="close" class="modal-close-icon" />
</button>
