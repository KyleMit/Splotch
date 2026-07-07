<script lang="ts">
  import { STYLE_NAMES } from '$lib/ai/styles';

  interface Props {
    // Object URL of the exported drawing; the style tiles stay disabled until
    // it exists (the modal wrapper loads it on open).
    previewUrl: string | null;
    onSelectStyle: (style: string) => void;
  }
  let { previewUrl, onSelectStyle }: Props = $props();
</script>

<fieldset class="ai-prompt-styles">
  <legend>Pick a style</legend>
  <div class="ai-style-options">
    {#each STYLE_NAMES as s (s)}
      <button
        type="button"
        class="ai-style-option"
        onclick={() => onSelectStyle(s)}
        disabled={!previewUrl}
      >
        <img
          class="ai-style-thumb"
          src="/styles/{s.toLowerCase()}.webp"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <span class="ai-style-label">{s}</span>
      </button>
    {/each}
  </div>
</fieldset>

<style>
  .ai-prompt-styles {
    border: none;
    padding: 0;
    margin: 0;
  }

  .ai-prompt-styles legend {
    font-size: 14px;
    font-weight: 600;
    color: #555;
    padding: 0;
    margin-bottom: 12px;
  }

  .ai-style-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .ai-style-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .ai-style-thumb {
    width: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    border-radius: 12px;
    border: 3px solid transparent;
    background: #fcfbf8;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .ai-style-label {
    font-size: 13px;
    font-weight: 600;
    color: #555;
    user-select: none;
  }

  @media (hover: hover) {
    .ai-style-option:hover:not(:disabled) .ai-style-thumb {
      border-color: var(--brand);
      transform: translateY(-2px);
    }

    .ai-style-option:hover:not(:disabled) .ai-style-label {
      color: var(--brand);
    }
  }

  .ai-style-option:active:not(:disabled) .ai-style-thumb {
    transform: scale(0.97);
  }

  .ai-style-option:focus-visible {
    outline: none;
  }

  .ai-style-option:focus-visible .ai-style-thumb {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(171, 113, 225, 0.35);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 35%, transparent);
  }

  .ai-style-option:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 420px) {
    .ai-style-options {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Short viewports (e.g. landscape on a small phone): trim chrome so the
     picker fits without forcing a scroll. */
  @media (max-height: 560px) {
    .ai-prompt-styles legend {
      margin-bottom: 8px;
    }
    .ai-style-options {
      gap: 8px;
    }
  }
</style>
