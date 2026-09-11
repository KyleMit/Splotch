<script lang="ts">
  import DialogHeader from '$lib/components/design/DialogHeader.svelte';
  import Button from '$lib/components/design/Button.svelte';
  import { primitiveSections } from './primitiveSections';
  import FocusSpecimens from './FocusSpecimens.svelte';
  import RuleLabel from '$lib/components/design/RuleLabel.svelte';
  import ButtonSpecimens from './ButtonSpecimens.svelte';
  import type { ResolvedTheme } from '$lib/theme';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import type { Orientation } from '$lib/platform';
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

  type DemoOrientation = Orientation;
  const demoOrientationOptions: SegmentedPickerOption<DemoOrientation>[] = [
    { value: 'portrait', label: 'Portrait', icon: 'mobile-portrait' },
    { value: 'landscape', label: 'Landscape', icon: 'mobile-landscape' },
  ];
  // Deselectable, like the real orientation segment: tapping the active side
  // releases it back to none.
  let demoOrientation = $state<DemoOrientation | null>('portrait');

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

  // The scroll-cue specimens read as a pair: enough lines to outrun the box at
  // any width the styleguide is read at, and few enough to sit in it whole. The
  // copy narrates the state the reader is looking at, so scrolling the first one
  // to its end is the demonstration.
  const overflowingLines = [
    'The cue is lit: there is more of this list below the fold.',
    'It is a reading of live scroll state, never decoration.',
    'One IntersectionObserver over a sentinel answers all three states.',
    'So there is no scroll listener, and nothing measured per frame.',
    'The fade sticks to the scrollport and costs the content no height.',
    'Grow what is above it and it re-reads itself.',
    'Show a surface that was hidden and it re-arms.',
    'Two lines left.',
    'Last line — and the fade has stood down.',
  ];
  const fittingLines = [
    'Short enough to sit in the box whole.',
    'So the cue never lights: there is nothing below to reach.',
  ];
</script>

<section class="primitive-specimens" aria-label="Primitive specimens">
  <!-- Each preview theme gets its own visibility-triggered busy demonstration. -->
  {#key theme}
    <h3 id={primitiveSections.dialogHeader.id} data-sg-section>
      Dialog header <code class="file-path">design/DialogHeader.svelte</code>
    </h3>
    <p class="sub-intro">
      Back and close share a 44px target and <code>--icon-ink</code> glyphs. Back has a flat fill with
      extra space before the title; close has a raised, outlined disc. The title can wrap; optional actions
      sit beside close.
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

  <h3 id={primitiveSections.scrollCue.id} data-sg-section>
    Scroll cue <code class="file-path">design/ScrollCue.svelte</code>
  </h3>
  <p class="sub-intro">
    The fade that says a scroller's content carries on below: absent while content fits, present
    while more remains under the fold, and absent again once the end is on screen.
  </p>
  <p class="sub-intro">
    When content mounts or appears in stages, pass <code>contentPending</code> to show the fade immediately.
    Clear it once the content is whole to resume the observed fit and scroll-end behavior.
  </p>
  <p class="sub-intro">
    For a bounded pane, wrap its scroller in <code>ScrollCue</code>. The <code>children</code>
    snippet receives an end-marker snippet to render as the scroller's last child. The fade paints beside
    the scroller as an overlay, covering its content edge while leaving scrollbar gutters clear. Its position
    is independent of content padding.
  </p>
  <p class="sub-intro">
    For content that scrolls with the document, or an existing scrolling dialog, render
    <code>ScrollCue</code> without children as the last child of the scrolling content. This form places
    its own sentinel and sticky fade there, measuring bottom padding to reach the scrollport edge. Both
    forms observe the sentinel through every scrolling ancestor, including this page. A specimen below
    the page's fold can therefore report more content until you bring it into view.
  </p>
  <p class="sub-intro">
    Depth is the inherited <code>--scroll-cue-height</code>. Set it on an ancestor of the fade; for
    the wrapper form that means above <code>ScrollCue</code>, since the scroller is the fade's
    sibling. These specimens use the default depth.
  </p>
  <div class="cue-demo">
    <figure class="cue-figure">
      <!-- Focusable because it scrolls: a scroll region holding nothing focusable
           is unreachable by keyboard, which every real call site avoids by holding
           controls and these text specimens cannot. Svelte reads the tabindex as
           one on a non-interactive element — the case jsx-a11y exempts for a
           scrollable region, and the reason the warning is silenced here. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="cue-scroller"
        tabindex="0"
        role="group"
        aria-label="Scroll cue specimen: content that overflows"
      >
        <ul class="cue-lines">
          {#each overflowingLines as line (line)}
            <li>{line}</li>
          {/each}
        </ul>
        <ScrollCue />
      </div>
      <figcaption>
        Live — scroll it. The fade retires on the last line and lights again the moment you leave
        it.
      </figcaption>
    </figure>
    <figure class="cue-figure">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="cue-scroller"
        tabindex="0"
        role="group"
        aria-label="Scroll cue specimen: content that fits"
      >
        <ul class="cue-lines">
          {#each fittingLines as line (line)}
            <li>{line}</li>
          {/each}
        </ul>
        <ScrollCue />
      </div>
      <figcaption>
        The same box over content that fits. Same markup, no fade — the third state costs the call
        site nothing.
      </figcaption>
    </figure>
    <figure class="cue-figure">
      <div class="cue-overlay-demo">
        <ScrollCue>
          {#snippet children(end)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="cue-scroller cue-overlay-scroller"
              tabindex="0"
              role="group"
              aria-label="Scroll cue specimen: bounded overlay"
            >
              <ul class="cue-lines">
                {#each overflowingLines as line (line)}
                  <li>{line}</li>
                {/each}
              </ul>
              {@render end()}
            </div>
          {/snippet}
        </ScrollCue>
      </div>
      <figcaption>
        Bounded pane — the marker scrolls with the lines; the fade stays at the content edge.
      </figcaption>
    </figure>
  </div>
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

  .picker-demo-narrow {
    max-width: 240px;
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

  .cue-demo {
    --cue-demo-height: 260px;

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-4);
    max-width: 620px;
  }

  .cue-figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
  }

  /* Deep enough that the default 72px cue reads at the share of a scrollport it
     takes in the app, rather than as a curtain over a demo box. Nothing else
     here configures the cue — it reads whichever box it is dropped into. */
  .cue-scroller {
    height: var(--cue-demo-height);
    overflow-y: auto;
    padding: var(--space-4);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  .cue-overlay-demo {
    display: flex;
    height: var(--cue-demo-height);
    overflow: hidden;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
  }

  .cue-overlay-scroller {
    flex: 1;
    min-height: 0;
    height: 100%;
    border: none;
    border-radius: 0;
  }

  .cue-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);
    color: var(--text);
  }

  .cue-figure figcaption {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }
</style>
