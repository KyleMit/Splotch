<script lang="ts">
  import DialogHeader from '$lib/components/design/DialogHeader.svelte';
  import Button from '$lib/components/design/Button.svelte';
  import { primitiveSections } from './primitiveSections';
  import FocusSpecimens from './FocusSpecimens.svelte';
  import RuleLabel from '$lib/components/design/RuleLabel.svelte';
  import ButtonSpecimens from './ButtonSpecimens.svelte';
  import type { ResolvedTheme } from '$lib/theme';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import ScrollCueSpecimens from './ScrollCueSpecimens.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import '$lib/components/deferredIcons';

  let { theme }: { theme: ResolvedTheme } = $props();
  const statusMessages = [
    { status: 'success', text: 'Success message: the action is complete.' },
    { status: 'error', text: 'Error message: explain what went wrong.' },
  ] as const;

  type DemoTheme = 'light' | 'dark' | 'system';
  const demoThemeOptions: SegmentedPickerOption<DemoTheme>[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
    { value: 'system', label: 'System', icon: 'theme-auto', disabled: true },
  ];
  let headerOpen = $state(true);
  let headerDetail = $state(true);
  let demoTheme = $state<DemoTheme>('light');
  // The same options as the specimen above, so the pair reads as one control
  // with and without its words rather than as two unrelated pickers.
  let demoCollapsedTheme = $state<DemoTheme>('light');

  type DemoKind = 'bug' | 'feature';
  const demoKindOptions: SegmentedPickerOption<DemoKind>[] = [
    { value: 'bug', label: 'First option' },
    { value: 'feature', label: 'Second option' },
  ];
  let demoKind = $state<DemoKind>('bug');

  type DemoPlatform = 'android' | 'ios';
  const demoPlatformOptions: SegmentedPickerOption<DemoPlatform>[] = [
    { value: 'android', label: 'First view', icon: 'android' },
    { value: 'ios', label: 'Second view', icon: 'phone-tablet' },
  ];
  let demoPlatform = $state<DemoPlatform>('android');

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

<section class="primitive-specimens" aria-label="Primitive specimens">
  <!-- Each preview theme gets its own visibility-triggered busy demonstration. -->
  {#key theme}
    <h3 id={primitiveSections.dialogHeader.id} data-sg-section>
      Dialog header <code class="file-path">design/DialogHeader.svelte</code>
    </h3>
    <p class="sub-intro">
      Back and close share a 44px target and <code>--icon-ink</code> glyphs. Back has a flat fill with
      extra space before the title; close has an outlined disc. The title can wrap; optional actions sit
      beside close.
    </p>
    <div class="header-specimen">
      {#if headerOpen}
        <DialogHeader
          onback={headerDetail ? () => (headerDetail = false) : undefined}
          onclose={() => (headerOpen = false)}
        >
          <h4>{headerDetail ? 'Appearance' : 'Settings'}</h4>
        </DialogHeader>
      {:else}
        <Button
          onclick={() => {
            headerOpen = true;
            headerDetail = true;
          }}>Show dialog header</Button
        >
      {/if}
    </div>

    <ButtonSpecimens />
  {/key}

  <FocusSpecimens />

  <h3 id={primitiveSections.picker.id} data-sg-section>
    Segmented picker <code class="file-path">design/SegmentedPicker.svelte</code>
  </h3>
  <p class="sub-intro">
    Choose <code>segment</code> for a single choice, <code>chip</code> for independent toggles, or
    <code>underline</code> for switching views. Radio mode selects one option; toggle mode lets the caller
    support deselection or multiple choices.
  </p>
  <p class="sub-intro">
    Variants below show labels, icon-only labels, a compact deselectable control, native form
    radios, view tabs, and multiple selection. Use <code>inputName</code> for a form that must work without
    JavaScript. Collapsible labels keep each icon’s accessible name and touch target.
  </p>
  <div class="picker-demo">
    <SegmentedPicker
      label="Theme (specimen)"
      options={demoThemeOptions}
      selected={demoTheme}
      onSelect={(value) => (demoTheme = value)}
    />
  </div>
  <div class="picker-demo picker-demo-collapsed">
    <SegmentedPicker
      label="Theme, labels collapsed (specimen)"
      fill={false}
      labels="collapsible"
      options={demoThemeOptions}
      selected={demoCollapsedTheme}
      onSelect={(value) => (demoCollapsedTheme = value)}
    />
  </div>
  <div class="picker-demo">
    <SegmentedPicker
      label="Native radio group (specimen)"
      options={demoKindOptions}
      selected={demoKind}
      onSelect={(value) => (demoKind = value)}
      inputName="sg-demo-kind"
    />
  </div>
  <div class="picker-demo">
    <SegmentedPicker
      variant="underline"
      label="View tabs (specimen)"
      options={demoPlatformOptions}
      selected={demoPlatform}
      onSelect={(value) => (demoPlatform = value)}
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

  <h3 id={primitiveSections.status.id} data-sg-section>
    Status message <code class="file-path">design/StatusMessage.svelte</code>
  </h3>
  <div class="status-demo">
    {#each statusMessages as message (message.status)}
      <StatusMessage status={message.status}>{message.text}</StatusMessage>
    {/each}
    <StatusMessage status="warning">
      <strong>Warning heading.</strong> Describe what needs attention, with an optional
      <code>detail</code>.
    </StatusMessage>
  </div>

  <h3 id={primitiveSections.rule.id} data-sg-section>
    Rule label <code class="file-path">design/RuleLabel.svelte</code>
  </h3>
  <div class="rule-demo">
    <div class="rule-section">
      <RuleLabel>Heading</RuleLabel>
      <p>Description or section content.</p>
    </div>
    <div class="rule-section">
      <RuleLabel as="h3" count="Count">Heading with count</RuleLabel>
      <p>The optional count follows the heading. Content sits below the rule.</p>
    </div>
    <div class="rule-section">
      <RuleLabel as="h4" strong>Strong heading</RuleLabel>
      <p>The heavier tier: section heads inside Settings, over the controls they name.</p>
    </div>
  </div>

  <h3 id={primitiveSections.disclosure.id} data-sg-section>
    Disclosure <code class="file-path">design/Disclosure.svelte</code>
  </h3>
  <p class="sub-intro">
    The primitive owns the bordered shell, the hidden native marker, and the <code>›</code> chevron
    that rotates on open. Padding, type, color, and background stay with the call site, through the
    forwarded <code>class</code>.
  </p>
  <Disclosure class="disclosure-demo">
    {#snippet summary()}Disclosure heading{/snippet}
    <p class="disclosure-demo-body">Help text is one calm sentence, styled by the call site.</p>
  </Disclosure>

  <ScrollCueSpecimens />
</section>

<style>
  .header-specimen {
    max-width: 375px;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
  }

  .header-specimen h4 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--font-size-lg);
  }

  section {
    margin-top: 48px;
  }

  h3 {
    margin: 22px 0 var(--space-1);
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    white-space: nowrap;
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

  /* Settings-column width, so the specimens read at their real proportions. */
  .picker-demo {
    max-width: 360px;
    margin-bottom: var(--space-3);
  }

  /* The specimen shows the mode's point, which is only visible once a caller
     takes the words away — the prop itself changes nothing until one does. */
  .picker-demo-collapsed :global(.option-label) {
    display: none;
  }

  .status-demo {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 480px;
  }

  .rule-demo {
    display: grid;
    gap: var(--space-8);
    max-width: 620px;
    padding: var(--space-4);
    background: var(--surface);
    border-radius: var(--radius-lg);
  }

  .rule-section {
    display: grid;
    gap: var(--space-5);
  }

  .rule-section p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text);
  }
</style>
