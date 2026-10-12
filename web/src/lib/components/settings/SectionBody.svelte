<script lang="ts" module>
  import type { Component } from 'svelte';
  import AppearanceSection from './AppearanceSection.svelte';
  import SoundSection from './SoundSection.svelte';
  import SavingSection from './SavingSection.svelte';
  import ColoringSection from './ColoringSection.svelte';
  import ControlsSection from './ControlsSection.svelte';
  import AccessibilitySection from './AccessibilitySection.svelte';
  import AiKeyManager from './AiKeyManager.svelte';
  import ParentCenterSection from './ParentCenterSection.svelte';
  import SetupInstructions from './SetupInstructions.svelte';
  import WhatsNewSection from './WhatsNewSection.svelte';
  import ReportForm from './ReportForm.svelte';
  import AboutSection from './AboutSection.svelte';
  import type { SectionId } from './sections';

  // The level of the heading each shell puts over a section body: the wide pane's title, or the
  // phone drill-in's dialog header. A body's own headings sit below it.
  export type SectionHeadingLevel = 2 | 3;

  // Only WhatsNewSection takes `onSettled` (it keeps growing after it mounts) and
  // `sectionHeadingLevel` (its release notes nest two levels deep); passing both uniformly is
  // fine — Svelte drops props a component doesn't declare — but the generated types can't express
  // that, so the map admits both prop shapes and the render site widens to the one that carries
  // them.
  type SectionProps = { onSettled?: () => void; sectionHeadingLevel: SectionHeadingLevel };
  type SectionComponent = Component<Record<string, never>> | Component<SectionProps>;

  const SECTION_CONTENT: Record<SectionId, SectionComponent> = {
    appearance: AppearanceSection,
    sound: SoundSection,
    saving: SavingSection,
    coloring: ColoringSection,
    controls: ControlsSection,
    accessibility: AccessibilitySection,
    ai: AiKeyManager,
    parentCenter: ParentCenterSection,
    setup: SetupInstructions,
    whatsnew: WhatsNewSection,
    feedback: ReportForm,
    about: AboutSection,
  };
</script>

<script lang="ts">
  interface Props {
    id: SectionId;
    sectionHeadingLevel: SectionHeadingLevel;
    /** Forwarded to the one section that keeps staging content after it mounts. */
    onSettled?: () => void;
  }

  let { id, sectionHeadingLevel, onSettled }: Props = $props();

  const Content = $derived(SECTION_CONTENT[id] as Component<SectionProps>);
</script>

<Content {onSettled} {sectionHeadingLevel} />
