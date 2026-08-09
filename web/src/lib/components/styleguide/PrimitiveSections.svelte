<script lang="ts">
  import Button from '$lib/components/design/Button.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';

  const buttonVariants = ['brand', 'wash', 'danger'] as const;
  const buttonSizes = ['md', 'sm'] as const;
  const statusMessageStatuses = ['success', 'error'] as const;

  type DemoTheme = 'light' | 'dark' | 'system';
  const demoThemeOptions: SegmentedPickerOption<DemoTheme>[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
    { value: 'system', label: 'System', icon: 'theme-auto', disabled: true },
  ];
  let demoTheme = $state<DemoTheme>('light');

  type DemoOrientation = 'portrait' | 'landscape';
  const demoOrientationOptions: SegmentedPickerOption<DemoOrientation>[] = [
    { value: 'portrait', label: 'Portrait', icon: 'mobile-portrait' },
    { value: 'landscape', label: 'Landscape', icon: 'mobile-landscape' },
  ];
  // Deselectable, like the real orientation segment: tapping the active side
  // releases it back to none.
  let demoOrientation = $state<DemoOrientation | null>('portrait');

  type DemoKind = 'bug' | 'feature';
  const demoKindOptions: SegmentedPickerOption<DemoKind>[] = [
    { value: 'bug', label: "Something's broken" },
    { value: 'feature', label: 'I have an idea' },
  ];
  let demoKind = $state<DemoKind>('bug');

  type DemoChip = 'eraser' | 'camera';
  const demoChipOptions: SegmentedPickerOption<DemoChip>[] = [
    { value: 'eraser', label: 'Eraser', icon: 'brush-eraser' },
    { value: 'camera', label: 'Screenshot', icon: 'camera' },
  ];
  let demoChips = $state<DemoChip[]>(['eraser']);

  function toggleDemoChip(value: DemoChip) {
    demoChips = demoChips.includes(value)
      ? demoChips.filter((chip) => chip !== value)
      : [...demoChips, value];
  }
</script>

<section id="primitives" data-sg-section>
  <h3>Primitives</h3>

  <h4>Button <code class="file-path">design/Button.svelte</code></h4>
  {#each buttonSizes as size (size)}
    <div class="button-row">
      {#each buttonVariants as variant (variant)}
        <Button {variant} {size}>{variant} {size}</Button>
      {/each}
      <Button variant="brand" {size} disabled>disabled</Button>
    </div>
  {/each}

  <h4>Segmented picker <code class="file-path">design/SegmentedPicker.svelte</code></h4>
  <p class="sub-intro">
    A control with a <strong>selected state</strong> is a picker, not a <code>Button</code>.
    <code>segment</code> is the raised-thumb track; <code>chip</code> is the borderless toggle grid;
    radio vs toggle semantics stay with the caller. A form that must post without JavaScript renders
    the same chrome over real native radios through <code>inputName</code>.
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
      label="Report type (specimen)"
      options={demoKindOptions}
      selected={demoKind}
      onSelect={(value) => (demoKind = value)}
      inputName="sg-demo-kind"
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

  <h4>Status message <code class="file-path">design/StatusMessage.svelte</code></h4>
  <div class="status-demo">
    {#each statusMessageStatuses as status (status)}
      <StatusMessage {status}
        >The {status} wash, as a form shows it after a submit resolves.</StatusMessage
      >
    {/each}
  </div>

  <h4>Disclosure <code class="file-path">design/Disclosure.svelte</code></h4>
  <p class="sub-intro">
    The primitive owns the bordered shell, the hidden native marker, and the <code>›</code> chevron
    that rotates on open. Padding, type, color, and background stay with the call site, through the
    forwarded <code>class</code>.
  </p>
  <Disclosure class="disclosure-demo">
    {#snippet summary()}Advanced controls{/snippet}
    <p class="disclosure-demo-body">Help text is one calm sentence, styled by the call site.</p>
  </Disclosure>
</section>

<style>
  section {
    margin-top: 48px;
    scroll-margin-top: 96px;
  }

  h3 {
    margin: 0 0 6px;
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  h4 {
    margin: 22px 0 var(--space-1);
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    /* The full component paths have no break opportunities and outgrow the
       narrowest phone viewports without this. */
    overflow-wrap: anywhere;
  }

  .file-path {
    font-weight: 400;
  }

  .sub-intro {
    max-width: 62ch;
    margin: 0 0 10px;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  section :global(.disclosure-demo) {
    max-width: 480px;
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
    padding: var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--text-soft);
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin: 10px 0;
  }

  /* Settings-column width, so the specimens read at their real proportions. */
  .picker-demo {
    max-width: 360px;
    margin-bottom: var(--space-3);
  }

  .picker-demo-narrow {
    max-width: 240px;
  }

  .status-demo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 480px;
  }
</style>
