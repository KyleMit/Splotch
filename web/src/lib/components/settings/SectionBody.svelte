<script lang="ts" module>
  import type { Component } from 'svelte';
  import AppearanceSection from './AppearanceSection.svelte';
  import SoundSection from './SoundSection.svelte';
  import SavingSection from './SavingSection.svelte';
  import ColoringSection from './ColoringSection.svelte';
  import ControlsSection from './ControlsSection.svelte';
  import AiKeyManager from './AiKeyManager.svelte';
  import ParentCenterSection from './ParentCenterSection.svelte';
  import SetupInstructions from './SetupInstructions.svelte';
  import WhatsNewSection from './WhatsNewSection.svelte';
  import ReportForm from './ReportForm.svelte';
  import AboutSection from './AboutSection.svelte';
  import type { SectionId } from './sections';

  // Not every section takes `open` (only AiKeyManager/SetupInstructions/ReportForm do); passing it
  // uniformly is fine — Svelte drops props a component doesn't declare — but the generated types
  // can't express that, so the map admits both prop shapes and the render site widens to the one
  // that carries `open`.
  type SectionComponent = Component<Record<string, never>> | Component<{ open?: boolean }>;

  const SECTION_CONTENT: Record<SectionId, SectionComponent> = {
    appearance: AppearanceSection,
    sound: SoundSection,
    saving: SavingSection,
    coloring: ColoringSection,
    controls: ControlsSection,
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
    open: boolean;
  }

  let { id, open }: Props = $props();

  const Content = $derived(SECTION_CONTENT[id] as Component<{ open?: boolean }>);
</script>

<Content {open} />
