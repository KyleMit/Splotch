<script lang="ts">
  import Button from '$lib/components/design/Button.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import type { Orientation } from '$lib/platform';

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

  <h4>Scroll cue <code class="file-path">design/ScrollCue.svelte</code></h4>
  <p class="sub-intro">
    The fade that says a scroller's content carries on below. It takes no props and answers for
    itself: absent while the content fits, present while there is more of it under the fold, absent
    again once the end is on screen. Its one contract is positional — render it as the
    <strong>last child of the scrolling content</strong>, because it plants its end-of-content
    sentinel wherever it stands, and a copy lifted out of the scroller measures the wrong end. Depth
    is the inherited <code>--scroll-cue-height</code>, declared by the call site on any ancestor;
    both specimens below take the default. The sentinel's observer leaves its root implicit — one
    component serving a dialog, a settings pane and a whole page without being told which — which is
    also why a specimen still under this page's own fold reports more below until you bring it up.
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
  </div>
</section>

<style>
  section {
    margin-top: 48px;
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

  .cue-demo {
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
    height: 260px;
    overflow-y: auto;
    padding: var(--space-4);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
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
