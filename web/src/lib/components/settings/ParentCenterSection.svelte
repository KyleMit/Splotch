<script lang="ts">
  import Button from '../design/Button.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { getPlatform } from '$lib/platform';
  import {
    endsParentCenterProtection,
    isParentalGateModeAvailable,
    isParentCenterUnprotected,
    parentalGatePolicies,
    PARENTAL_GATE_FEATURES,
    PARENTAL_GATE_MODES,
    setParentalGateMode,
    type ParentalGateFeature,
    type ParentalGateMode,
  } from '$lib/state/parentalGate.svelte';

  const MODE_LABELS: Record<ParentalGateMode, string> = {
    always: 'Every time',
    session: 'Per session',
    never: 'Never',
  };

  const MODE_OPTIONS: SegmentedPickerOption<ParentalGateMode>[] = PARENTAL_GATE_MODES.map(
    (mode) => ({ value: mode, label: MODE_LABELS[mode] })
  );

  const PROTECTED_FEATURES: Record<ParentalGateFeature, { label: string; help: string }> = {
    aiImage: {
      label: 'Generating an AI image',
      help: 'Before a drawing is sent to Google for image generation.',
    },
    imageReport: {
      label: 'Reporting an AI picture',
      help: 'Before a drawing and generated picture are sent to Splotch for review.',
    },
    externalLinks: {
      label: 'Viewing external links',
      help: 'Before a link opens another website or app.',
    },
    feedback: {
      label: 'Sending feedback',
      help: "Before a report is sent to Splotch's issue tracker.",
    },
    parentCenter: {
      label: 'Opening Parent Center',
      help: 'Before anyone can change these protections.',
    },
  };

  // One sentence for both warning surfaces: the confirmation that stands in
  // front of the choice, and the note that stands beside it for as long as the
  // choice holds.
  const UNPROTECTED_CONSEQUENCE =
    "Anyone using this device can open Parent Center and change Splotch's settings and protections.";

  const platform = getPlatform();

  const parentCenterUnprotected = $derived(isParentCenterUnprotected());

  // The pending choice needs no payload: Parent Center's Never is the only one
  // that asks, so confirming has exactly one thing left to do.
  let confirmingUnprotected = $state(false);

  function optionsFor(feature: ParentalGateFeature): SegmentedPickerOption<ParentalGateMode>[] {
    return MODE_OPTIONS.map((option) => ({
      ...option,
      disabled: !isParentalGateModeAvailable(feature, option.value, platform),
    }));
  }

  // Nothing persists until the parent confirms, so the picker keeps showing the
  // prior policy behind the dialog and a cancel leaves it exactly there.
  function chooseMode(feature: ParentalGateFeature, mode: ParentalGateMode) {
    if (endsParentCenterProtection(feature, mode)) confirmingUnprotected = true;
    else setParentalGateMode(feature, mode);
  }

  function confirmUnprotected() {
    setParentalGateMode('parentCenter', 'never');
    confirmingUnprotected = false;
  }

  function cancelUnprotected() {
    confirmingUnprotected = false;
  }
</script>

<section class="setting-group parent-center">
  <p class="parent-center-intro">
    Choose when Splotch should ask for a grown-up check. Each action includes a short explanation so
    you can see what the protection is for.
  </p>

  <div class="policy-list">
    <!-- Names the three mode columns once for the matrix layout. Decorative:
         every option keeps its own label as its accessible name, hidden
         visually there rather than removed. -->
    <div class="policy-header" aria-hidden="true">
      <span>Action</span>
      <div class="policy-header-modes">
        {#each PARENTAL_GATE_MODES as mode (mode)}
          <span>{MODE_LABELS[mode]}</span>
        {/each}
      </div>
    </div>

    {#each PARENTAL_GATE_FEATURES as featureId (featureId)}
      {@const feature = PROTECTED_FEATURES[featureId]}
      {@const helpId = `parental-gate-${featureId}-help`}
      {@const unavailableHelpId = isParentalGateModeAvailable(featureId, 'never', platform)
        ? undefined
        : `parental-gate-${featureId}-unavailable`}
      {@const warningId =
        featureId === 'parentCenter' && parentCenterUnprotected
          ? `parental-gate-${featureId}-warning`
          : undefined}
      <article class="setting policy-card">
        <div class="protection-copy">
          <h3>{feature.label}</h3>
          <p id={helpId}>{feature.help}</p>
        </div>

        <SegmentedPicker
          class="policy-picker"
          label={`${feature.label} parental gate frequency`}
          describedBy={[helpId, unavailableHelpId, warningId].filter(Boolean).join(' ')}
          options={optionsFor(featureId)}
          selected={parentalGatePolicies[featureId]}
          onSelect={(mode) => chooseMode(featureId, mode)}
        />

        {#if unavailableHelpId}
          <div id={unavailableHelpId} class="unavailable-explanation" role="note">
            <strong>Why Never is unavailable on iOS</strong>
            <span>
              Apple's Kids Category requires links that leave Splotch to stay behind a grown-up
              check. Choose Every time or Per session instead.
            </span>
          </div>
        {/if}

        {#if warningId}
          <div id={warningId} class="protection-warning" role="note">
            <strong>This check is off</strong>
            <span>{UNPROTECTED_CONSEQUENCE}</span>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  <div class="mode-note">
    <p><strong>Per session</strong> asks once until Splotch is closed.</p>
    <p><strong>Never</strong> skips the grown-up check on this device where available.</p>
  </div>
</section>

<!-- A sibling of the section rather than a child of it: this card is promoted to
     the top layer over the whole Settings modal, and nesting it inside the
     policy matrix would leave a box in that layout claiming a width the matrix
     never gives it. -->
<dialog
  class="unprotected-confirm modal-dialog modal-fly-in modal-shell"
  aria-labelledby="parentCenterUnprotectedTitle"
  use:modalDialog={() => ({
    open: confirmingUnprotected,
    onRequestClose: cancelUnprotected,
  })}
>
  <div class="unprotected-confirm-content">
    <div class="unprotected-confirm-heading">
      <h3 id="parentCenterUnprotectedTitle">Turn off the Parent Center check?</h3>
      <p>{UNPROTECTED_CONSEQUENCE}</p>
    </div>

    <div class="unprotected-confirm-actions">
      <Button size="lg" onclick={cancelUnprotected}>Keep the check</Button>
      <Button variant="danger" size="lg" onclick={confirmUnprotected}>Turn it off</Button>
    </div>
  </div>
</dialog>

<style>
  .parent-center-intro,
  .mode-note {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .parent-center-intro {
    margin-bottom: var(--space-6);
  }

  .policy-list {
    /* Widths the matrix layout below is built from. The mode column clears the
       three options at the 44px minimum target plus the segmented track's own
       4px gaps and padding, with room left over so the radio marks aren't
       packed against each other; the copy column keeps a protection's name to
       two lines with the same breathing room. */
    --policy-copy-min: 200px;
    --policy-modes-column: 180px;
    --policy-columns: minmax(var(--policy-copy-min), 1fr) var(--policy-modes-column);

    container-type: inline-size;
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--space-3);
  }

  .policy-header {
    display: none;
  }

  .protection-copy h3,
  .protection-copy p {
    margin: 0;
  }

  .protection-copy {
    min-width: 0;
    margin-bottom: var(--space-3);
  }

  .protection-copy h3 {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  .protection-copy p {
    margin-top: var(--space-1);
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .policy-card {
    min-width: 0;
  }

  .unavailable-explanation,
  .protection-warning {
    margin-top: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .unavailable-explanation {
    background: var(--brand-wash);
    color: var(--text);
  }

  /* The one note here that reports a protection being off rather than
     explaining why a choice is unavailable, so it takes the danger wash. */
  .protection-warning {
    background: var(--danger-wash);
    color: var(--danger-text);
  }

  .unavailable-explanation strong,
  .unavailable-explanation span,
  .protection-warning strong,
  .protection-warning span {
    display: block;
  }

  .unavailable-explanation strong,
  .protection-warning strong {
    font-weight: var(--font-weight-semibold);
  }

  .unavailable-explanation strong {
    color: var(--text-strong);
  }

  /* A footnote, not a control: no tinted panel, so the five policy tiles stay
     the only filled surfaces and the radio marks keep the eye. The inline
     padding lines the sentences up with the copy inside the matrix tiles. */
  .mode-note {
    display: flex;
    flex-direction: column;
    margin-top: var(--space-5);
    gap: var(--space-2);
    padding: 0 var(--space-5);
  }

  .mode-note p {
    margin: 0;
  }

  .mode-note strong {
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  /* Matrix layout: the protection on the left, one shared column per mode on
     the right, so five policies read as a table instead of five stacked cards.
     It turns on once the list can give a card the copy column, the mode
     column, the gap between them and the card's own 40px of padding —
     200 + 180 + 24 + 40 = 444. A *container* query, not a viewport one: the
     same viewport hands this list wildly different widths depending on which
     settings shell it lands in, and only the width it actually gets decides
     whether the matrix fits without scrolling sideways. */
  @container (min-width: 444px) {
    .policy-header,
    .policy-card {
      display: grid;
      grid-template-columns: var(--policy-columns);
      align-items: center;
      column-gap: var(--space-6);
    }

    /* Deliberately over-qualified: SettingsModal's shared card padding and
       radius reach these tiles through `.settings-content :global(.setting)`,
       which already carries three classes once Svelte adds its scope, so a
       plain `.policy-card` ties it and loses on source order. */
    .policy-list .policy-card.setting {
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-md);
    }

    .policy-header {
      align-items: center;
      padding: 0 var(--space-5);
      color: var(--text-soft);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    /* Same track geometry as the segmented picker below it, so each heading
       sits over the option it names. */
    .policy-header-modes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      align-items: center;
      gap: var(--space-1);
      padding: 0 var(--space-1);
      line-height: 1.25;
      text-align: center;
    }

    .protection-copy {
      margin-bottom: 0;
    }

    .unavailable-explanation,
    .protection-warning {
      grid-column: 1 / -1;
    }

    /* The column heading names the mode, so each option shows a radio mark
       instead of repeating it. The label stays in the DOM — it is still the
       option's accessible name — just out of view. */
    .policy-card :global(.policy-picker .option-label) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .policy-card :global(.policy-picker .option) {
      position: relative;
    }

    .policy-card :global(.policy-picker .option::after) {
      content: '';
      width: 22px;
      height: 22px;
      box-sizing: border-box;
      border: 3px solid var(--border-warm-strong);
      border-radius: var(--radius-pill);
    }

    /* Textless fill, so the identity hue rather than the label-bearing ramp. */
    .policy-card :global(.policy-picker .option.active::after) {
      border-color: var(--brand);
      background: var(--brand);
      box-shadow: inset 0 0 0 4px var(--surface);
    }
  }

  /* ── Turn-off confirmation ──────────────────────────────────────────────── */

  /* Phone width and card padding are the parental gate's: this dialog stands in
     for the check that gate performs, and the two should read as one boundary. */
  .unprotected-confirm {
    width: min(92vw, 336px);
  }

  .unprotected-confirm-content {
    display: flex;
    flex-direction: column;
    padding: 22px var(--space-6) var(--space-5);
    gap: var(--space-4);
  }

  /* Title and copy are one group, so they sit closer than the dialog's own
     rhythm separates the groups from each other. */
  .unprotected-confirm-heading {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .unprotected-confirm-heading h3 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    line-height: 1.2;
  }

  .unprotected-confirm-heading p {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.45;
    text-wrap: pretty;
  }

  /* Wraps to a column on the narrowest phones: the two labels name what each
     choice does, and a shrunken pair would truncate exactly that. */
  .unprotected-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .unprotected-confirm-actions :global(.btn) {
    flex: 1 1 140px;
  }

  /* Reduced motion: fade instead of flying in, as the parental gate already does. */
  @media (prefers-reduced-motion: reduce) {
    .unprotected-confirm.modal-fly-in[open] {
      animation: unprotectedConfirmFadeIn var(--duration-base) ease;
    }
  }

  @keyframes unprotectedConfirmFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
