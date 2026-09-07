<script lang="ts">
  import Button from '$lib/components/design/Button.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import { scaleUsage } from '$lib/design/tokenUsage';
  import { scale, toCssVarName } from '$lib/design/tokens';

  type Choice = 'one' | 'two';
  const options: SegmentedPickerOption<Choice>[] = [
    { value: 'one', label: 'One' },
    { value: 'two', label: 'Two' },
  ];
  const focusKeys = ['focusRingWidth', 'focusRingOffset'] as const;
  let selected = $state<Choice>('one');
</script>

<div class="focus-demo">
  <h4>Focus</h4>
  <p>Tab through these controls to see the same brand ring follow each shape.</p>
  <div class="focus-controls">
    <Button variant="brand">Brand action</Button>
    <Button variant="wash">Wash action</Button>
    <button type="button" class="text-action">Copy link</button>
    <label class="input-demo">
      Access code
      <input placeholder="splotch-1234" />
    </label>
    <SegmentedPicker
      label="Focus specimen choice"
      {options}
      {selected}
      fill={false}
      onSelect={(value) => (selected = value)}
    />
    <Button variant="wash" class="focus-pill">Folder pill</Button>
  </div>
  <div class="wrong-focus">
    <span class="browser-default">Copy link</span>
    <span>Wrong: browser default outline (static comparison, outside the tab order).</span>
  </div>
  <dl>
    {#each focusKeys as key (key)}
      <dt><code>{toCssVarName(key)}</code> · {scale[key]}</dt>
      <dd>{scaleUsage[key]}</dd>
    {/each}
  </dl>
</div>

<style>
  h4 {
    margin: var(--space-6) 0 var(--space-1);
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  p,
  dl,
  .wrong-focus {
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .focus-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-4) 0;
  }

  .text-action,
  .browser-default {
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--brand-text);
    font: inherit;
  }

  .text-action {
    cursor: pointer;
  }

  .input-demo {
    display: grid;
    gap: var(--space-2);
    color: var(--text);
    font-size: var(--font-size-sm);
    max-width: 100%;
  }

  input {
    min-width: 0;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-strong);
    font-family: inherit;
    font-size: var(--input-font-size);
  }

  input:focus-visible {
    border-color: var(--brand-solid);
  }

  .focus-controls :global(.focus-pill) {
    border-radius: var(--radius-pill);
  }

  .wrong-focus {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-3) 0 var(--space-5);
  }

  /* Static counterexample: keyboard-focusable specimens use the global rule. */
  .browser-default {
    outline: auto;
  }

  dt {
    color: var(--text);
    margin-top: var(--space-3);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }
</style>
