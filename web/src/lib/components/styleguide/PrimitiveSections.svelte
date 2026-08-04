<script lang="ts">
  import Button from '$lib/components/design/Button.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';

  const buttonVariants = ['brand', 'wash', 'danger', 'ghost'] as const;
  const buttonSizes = ['md', 'sm'] as const;
  const statusMessageStatuses = ['success', 'error'] as const;

  type DemoTheme = 'light' | 'dark' | 'system';
  const demoThemeOptions: SegmentedPickerOption<DemoTheme>[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
    { value: 'system', label: 'System', icon: 'theme-auto' },
  ];
  let demoTheme = $state<DemoTheme>('system');

  type DemoOrientation = 'portrait' | 'landscape';
  const demoOrientationOptions: SegmentedPickerOption<DemoOrientation>[] = [
    { value: 'portrait', label: 'Portrait', icon: 'mobile-portrait' },
    { value: 'landscape', label: 'Landscape', icon: 'mobile-landscape' },
  ];
  // Deselectable, like the real orientation segment: tapping the active side
  // releases it back to none.
  let demoOrientation = $state<DemoOrientation | null>('portrait');

  type DemoChip = 'eraser' | 'camera';
  const demoChipOptions: SegmentedPickerOption<DemoChip>[] = [
    { value: 'eraser', label: 'Eraser', icon: 'eraser' },
    { value: 'camera', label: 'Screenshot', icon: 'camera' },
  ];
  let demoChips = $state<DemoChip[]>(['eraser']);

  function toggleDemoChip(value: DemoChip) {
    demoChips = demoChips.includes(value)
      ? demoChips.filter((chip) => chip !== value)
      : [...demoChips, value];
  }
</script>

<section>
  <h3>Button</h3>
  <p><code>lib/components/design/Button.svelte</code></p>
  {#each buttonSizes as size (size)}
    <div class="button-row">
      {#each buttonVariants as variant (variant)}
        <Button {variant} {size}>{variant} {size}</Button>
      {/each}
      <Button variant="brand" {size} disabled>disabled</Button>
    </div>
  {/each}
</section>

<section>
  <h3>Segmented picker</h3>
  <p>
    <code>lib/components/design/SegmentedPicker.svelte</code> — a control with a
    <strong>selected state</strong> is a picker, not a <code>Button</code>. <code>mode</code> picks
    the semantics (<code>radio</code> chooses one; <code>toggle</code> leaves deselection and
    multi-select to the caller), <code>variant</code> the skin: the <code>segment</code> track's
    active option reads as a raised card on <code>--shadow-control</code>, and <code>chip</code> is the
    bordered toggle grid.
  </p>
  <div class="picker-demo">
    <SegmentedPicker
      label="Theme (specimen)"
      options={demoThemeOptions}
      selected={demoTheme}
      onSelect={(value) => (demoTheme = value)}
    />
  </div>
  <div class="picker-demo picker-demo-narrow">
    <SegmentedPicker
      label="Lock screen orientation (specimen)"
      mode="toggle"
      size="sm"
      options={demoOrientationOptions}
      selected={demoOrientation}
      onSelect={(value) => (demoOrientation = demoOrientation === value ? null : value)}
    />
  </div>
  <div class="picker-demo">
    <SegmentedPicker
      variant="chip"
      mode="toggle"
      label="Show these buttons (specimen)"
      options={demoChipOptions}
      selected={demoChips}
      onSelect={toggleDemoChip}
    />
  </div>
</section>

<section>
  <h3>Status message</h3>
  <p><code>lib/components/design/StatusMessage.svelte</code></p>
  {#each statusMessageStatuses as status (status)}
    <StatusMessage {status}
      >The {status} wash, as a form shows it after a submit resolves.</StatusMessage
    >
  {/each}
</section>

<section>
  <h3>Disclosure</h3>
  <p><code>lib/components/design/Disclosure.svelte</code></p>
  <Disclosure class="disclosure-demo">
    {#snippet summary()}What does the primitive own?{/snippet}
    <p class="disclosure-demo-body">
      The bordered shell, the hidden native marker, and the <code>›</code> chevron that rotates on
      open. Padding, type, color, and background stay with the call site, through the forwarded
      <code>class</code>.
    </p>
  </Disclosure>
</section>

<style>
  section {
    margin-top: var(--space-8);
  }

  section > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-sm);
  }

  h3 {
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    /* The full component paths have no break opportunities and outgrow the
       narrowest phone viewports without this. */
    overflow-wrap: anywhere;
  }

  section :global(.disclosure-demo summary) {
    padding: var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--brand-text);
    background: var(--surface-2);
  }

  .disclosure-demo-body {
    margin: 0;
    padding: 0 var(--space-3) var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--text-soft);
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  /* Settings-column width, so the specimens read at their real proportions. */
  .picker-demo {
    max-width: 360px;
    margin-bottom: var(--space-3);
  }

  .picker-demo-narrow {
    max-width: 240px;
  }
</style>
