# Icon census (issue 1020, phase 1)

94 icons: 40 startup, 54 deferred; 26 spot (colorful) by the chroma classifier.

## Concept families with more than one icon in use

| Concept | Icons in use (call sites) | Icons shipped but unreferenced outside registries |
| --- | --- | --- |
| disclosure chevron | `chevron-down` (3), `chevron-left` (3), `chevron-right` (4), `chevron-up` (1) | — |
| close / dismiss | `backspace` (1), `close` (8) | — |
| install to home screen | `add-homescreen` (2), `home` (1), `install-homescreen` (2), `share-ios` (2) | — |
| customize / controls | `controls` (3), `customize` (2), `dashboard-customize` (2), `setup` (1) | — |
| download / save | `download` (4), `folder` (1), `save-picture` (2) | — |
| camera / screenshot | `camera` (3), `camera-party` (1) | — |
| sound / volume | `sound` (2), `volume-off` (3), `volume-on` (3) | — |
| theme / appearance | `appearance` (1), `theme-auto` (3), `theme-dark` (6), `theme-light` (6) | — |
| orientation / device | `mobile-landscape` (4), `mobile-lock` (2), `mobile-portrait` (4), `mobile-rotate` (2), `phone-tablet` (2) | — |
| brush tools | `brush-crayon` (4), `brush-eraser` (5), `brush-magic` (5), `brush-pen` (5) | — |
| line weight | `line-weight-brush` (3), `line-weight-eraser` (2), `line-weight-magic` (2) | — |
| size previews | `size-brush-1` (2), `size-brush-2` (2), `size-brush-3` (2), `size-brush-4` (2), `size-brush-5` (2), `size-eraser-1` (2), `size-eraser-2` (2), `size-eraser-3` (2), `size-eraser-4` (2), `size-eraser-5` (2), `size-magic-1` (2), `size-magic-2` (2), `size-magic-3` (2), `size-magic-4` (2), `size-magic-5` (2) | — |
| release notes | `release-fixed` (1), `release-improved` (1), `release-new` (1), `whats-new` (3) | — |
| dottie expressions | `dottie-another-idea` (2), `dottie-bright` (1), `dottie-giggle` (1), `dottie-hiccup` (2), `dottie-kind-eyes` (1), `dottie-lean` (1), `dottie-question` (1), `dottie-retry` (1), `dottie-stumped` (2), `dottie-sunny` (1) | — |
| trash / clear | `trash-closed` (3), `trash-open` (3) | — |
| fullscreen | `fullscreen` (2), `fullscreen-exit` (2) | — |
| refresh / retry | `dottie-retry` (1), `refresh` (1) | — |

## Every icon

| Icon | Tier | Chroma | Sites | Call sites |
| --- | --- | --- | --- | --- |
| `accessibility` | deferred | mono | 1 | `components/settings/sections.ts` |
| `add-homescreen` | deferred | mono | 2 | `components/InstallBanner.svelte`, `components/styleguide/AssetSections.svelte` |
| `android` | startup | mono | 14 | `../routes/beta/+page.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/SetupInstructions.svelte`, `../routes/dev/notch/lib/deviceProfile.ts`, `../routes/dev/notch/lib/devices.ts`, `../routes/dev/notch/lib/diagnostics.ts`, `../routes/android-beta/+page.ts`, `state/books.ts`, `state/install.svelte.ts`, `platform/index.ts`, `platform/notchBand.ts`, `drawing/screenshot.ts`, `components/beta/betaPlatform.ts`, `boot/systemBack.ts` |
| `appearance` | deferred | spot | 1 | `components/settings/sections.ts` |
| `backspace` | deferred | mono | 1 | `components/ParentalGateKeypad.svelte` |
| `brush-crayon` | startup | spot | 4 | `components/styleguide/AssetSections.svelte`, `components/styleguide/ChromeSections.svelte`, `state/tool.svelte.ts`, `components/settings/drawingTools.ts` |
| `brush-eraser` | startup | spot | 5 | `components/styleguide/AssetSections.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/ControlsSection.svelte`, `state/tool.svelte.ts`, `components/settings/drawingTools.ts` |
| `brush-magic` | startup | spot | 5 | `components/styleguide/AssetSections.svelte`, `components/styleguide/ChromeSections.svelte`, `state/tool.svelte.ts`, `design/iconTokens.ts`, `components/settings/drawingTools.ts` |
| `brush-pen` | startup | spot | 5 | `components/AiErrorCard.svelte`, `components/styleguide/AssetSections.svelte`, `components/styleguide/ChromeSections.svelte`, `components/settings/SoundSection.svelte`, `state/tool.svelte.ts` |
| `button-style-flat` | deferred | mono | 1 | `components/settings/AppearanceSection.svelte` |
| `button-style-raised` | deferred | mono | 1 | `components/settings/AppearanceSection.svelte` |
| `camera` | startup | spot | 3 | `components/ActionsPanel.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/SavingSection.svelte` |
| `camera-party` | deferred | mono | 1 | `components/settings/SavingSection.svelte` |
| `check` | deferred | mono | 4 | `components/ParentalGate.svelte`, `components/ParentalGateKeypad.svelte`, `components/settings/AiValueProp.svelte`, `components/design/SegmentedPicker.svelte` |
| `chevron-down` | deferred | mono | 3 | `components/InstallBanner.svelte`, `components/styleguide/AssetSections.svelte`, `components/admin/InviteRowActions.svelte` |
| `chevron-left` | deferred | mono | 3 | `components/styleguide/AssetSections.svelte`, `components/page/BackLink.svelte`, `components/design/DialogHeader.svelte` |
| `chevron-right` | startup | mono | 4 | `components/ActionsPanel.svelte`, `components/styleguide/AssetSections.svelte`, `components/settings/WhatsNewSection.svelte`, `components/beta/BetaTroubleshooting.svelte` |
| `chevron-up` | deferred | mono | 1 | `components/styleguide/AssetSections.svelte` |
| `close` | startup | mono | 8 | `components/ActivePageChip.svelte`, `components/InstallBanner.svelte`, `components/SaveFailureBanner.svelte`, `components/styleguide/ChromeSections.svelte`, `components/settings/SavingSection.svelte`, `components/design/DialogHeader.svelte`, `drawing/magicBrush.ts`, `actions/modalDialog.svelte.ts` |
| `controls` | deferred | spot | 3 | `../routes/dev/notch/+page.svelte`, `components/styleguide/ScaleSections.svelte`, `components/settings/sections.ts` |
| `customize` | deferred | mono | 2 | `components/styleguide/ChromeSections.svelte`, `components/settings/AiFeatureToggles.svelte` |
| `dashboard-customize` | deferred | mono | 2 | `components/settings/CompactShell.svelte`, `components/settings/ControlsSection.svelte` |
| `dottie-another-idea` | deferred | mono | 2 | `components/AiErrorCard.svelte`, `components/styleguide/VoiceSections.svelte` |
| `dottie-bright` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `dottie-giggle` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `dottie-hiccup` | deferred | mono | 2 | `components/SaveFailureBanner.svelte`, `components/styleguide/VoiceSections.svelte` |
| `dottie-kind-eyes` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `dottie-lean` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `dottie-question` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `dottie-retry` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `dottie-stumped` | deferred | mono | 2 | `components/AiErrorCard.svelte`, `components/styleguide/VoiceSections.svelte` |
| `dottie-sunny` | deferred | mono | 1 | `components/styleguide/VoiceSections.svelte` |
| `download` | deferred | mono | 4 | `components/AiImageResult.svelte`, `components/styleguide/ChromeSections.svelte`, `components/settings/AiFeatureToggles.svelte`, `components/settings/ColoringSection.svelte` |
| `feedback` | startup | spot | 6 | `../routes/privacy/+page.svelte`, `components/settings/ReportForm.svelte`, `components/report/ReportFields.svelte`, `../routes/privacy/contents.ts`, `state/parentalGate.svelte.ts`, `components/settings/sections.ts` |
| `flag` | deferred | mono | 1 | `components/AiResultDisclosure.svelte` |
| `folder` | deferred | mono | 1 | `components/settings/SavingSection.svelte` |
| `fullscreen` | startup | mono | 2 | `components/FullscreenToggle.svelte`, `components/styleguide/AssetSections.svelte` |
| `fullscreen-exit` | startup | mono | 2 | `components/FullscreenToggle.svelte`, `components/styleguide/AssetSections.svelte` |
| `github` | deferred | mono | 1 | `components/settings/AboutSection.svelte` |
| `home` | deferred | mono | 1 | `components/settings/SetupInstructions.svelte` |
| `ink-splotch` | startup | mono | 1 | `components/ColorControl.svelte` |
| `install-homescreen` | deferred | mono | 2 | `components/InstallBanner.svelte`, `components/styleguide/AssetSections.svelte` |
| `line-weight-brush` | startup | mono | 3 | `components/ActionsPanel.svelte`, `components/styleguide/AssetSections.svelte`, `components/settings/drawingTools.ts` |
| `line-weight-eraser` | startup | mono | 2 | `components/ActionsPanel.svelte`, `components/styleguide/AssetSections.svelte` |
| `line-weight-magic` | startup | spot | 2 | `components/ActionsPanel.svelte`, `components/styleguide/AssetSections.svelte` |
| `loading` | startup | mono | 1 | `components/ActionsPanel.svelte` |
| `lock` | deferred | mono | 2 | `components/settings/AiKeyManager.svelte`, `components/settings/AiValueProp.svelte` |
| `mobile-landscape` | deferred | mono | 4 | `components/styleguide/AssetSections.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/AppearanceSection.svelte`, `components/settings/CompactShell.svelte` |
| `mobile-lock` | deferred | mono | 2 | `components/styleguide/AssetSections.svelte`, `components/settings/AppearanceSection.svelte` |
| `mobile-portrait` | deferred | mono | 4 | `components/styleguide/AssetSections.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/AppearanceSection.svelte`, `components/settings/CompactShell.svelte` |
| `mobile-rotate` | deferred | mono | 2 | `components/styleguide/AssetSections.svelte`, `components/settings/AppearanceSection.svelte` |
| `more-colors` | startup | spot | 2 | `components/ColorMenu.svelte`, `components/ColorPalette.svelte` |
| `parent-center` | deferred | spot | 2 | `components/ParentalGateManageFooter.svelte`, `components/settings/sections.ts` |
| `phone-tablet` | deferred | mono | 2 | `../routes/beta/+page.svelte`, `components/styleguide/PrimitiveSections.svelte` |
| `photo-size-select-small` | deferred | mono | 2 | `components/styleguide/ChromeSections.svelte`, `components/settings/ButtonSizeSetting.svelte` |
| `picture-stack` | deferred | mono | 1 | `components/settings/ColoringSection.svelte` |
| `reduce-motion` | deferred | mono | 1 | `components/settings/AccessibilitySection.svelte` |
| `refresh` | deferred | mono | 1 | `components/AiErrorCard.svelte` |
| `release-fixed` | deferred | mono | 1 | `releaseSections.ts` |
| `release-improved` | deferred | mono | 1 | `releaseSections.ts` |
| `release-new` | deferred | mono | 1 | `releaseSections.ts` |
| `save-picture` | deferred | spot | 2 | `design/iconTokens.ts`, `components/settings/sections.ts` |
| `settings` | startup | mono | 8 | `../routes/+page.svelte`, `components/InstallBanner.svelte`, `components/ParentalGateManageFooter.svelte`, `components/SettingsButton.svelte`, `components/styleguide/ChromeMiniMap.svelte`, `components/styleguide/ChromeSections.svelte`, `state/ui.svelte.ts`, `boot/bootHiddenOverlays.ts` |
| `setup` | deferred | spot | 1 | `components/settings/sections.ts` |
| `shapes` | startup | spot | 4 | `components/ActionsPanel.svelte`, `components/settings/ColoringSection.svelte`, `state/bookCatalog.ts`, `components/settings/sections.ts` |
| `share-ios` | deferred | mono | 2 | `components/InstallBanner.svelte`, `components/settings/SetupInstructions.svelte` |
| `size-brush-1` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-brush-2` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-brush-3` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-brush-4` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-brush-5` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-eraser-1` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-eraser-2` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-eraser-3` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-eraser-4` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-eraser-5` | startup | mono | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-magic-1` | startup | spot | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-magic-2` | startup | spot | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-magic-3` | startup | spot | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-magic-4` | startup | spot | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `size-magic-5` | startup | spot | 2 | `components/styleguide/AssetSections.svelte`, `state/strokeWidth.svelte.ts` |
| `sound` | deferred | spot | 2 | `components/settings/WideShell.svelte`, `components/settings/sections.ts` |
| `splotchy` | startup | spot | 4 | `components/SectionIcon.svelte`, `components/SplotchyIcon.svelte`, `components/iconTypes.ts`, `components/settings/sections.ts` |
| `swipe-down` | startup | mono | 1 | `components/ClearCoachmark.svelte` |
| `theme-auto` | deferred | mono | 3 | `components/styleguide/AssetSections.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/AppearanceSection.svelte` |
| `theme-dark` | deferred | mono | 6 | `../routes/design/+page.svelte`, `components/SettingsModal.svelte`, `components/styleguide/AssetSections.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/AppearanceSection.svelte`, `components/settings/CompactShell.svelte` |
| `theme-light` | deferred | mono | 6 | `../routes/design/+page.svelte`, `components/SettingsModal.svelte`, `components/styleguide/AssetSections.svelte`, `components/styleguide/PrimitiveSections.svelte`, `components/settings/AppearanceSection.svelte`, `components/settings/CompactShell.svelte` |
| `trash-closed` | startup | spot | 3 | `components/ClearButton.svelte`, `components/styleguide/AssetSections.svelte`, `components/settings/SoundSection.svelte` |
| `trash-open` | startup | spot | 3 | `components/ClearButton.svelte`, `components/ClearCoachmark.svelte`, `components/styleguide/AssetSections.svelte` |
| `undo` | startup | spot | 2 | `components/ActionsPanel.svelte`, `components/settings/drawingTools.ts` |
| `volume-off` | deferred | mono | 3 | `components/styleguide/AssetSections.svelte`, `components/settings/CompactShell.svelte`, `components/settings/SoundSection.svelte` |
| `volume-on` | deferred | mono | 3 | `components/styleguide/AssetSections.svelte`, `components/settings/CompactShell.svelte`, `components/settings/SoundSection.svelte` |
| `wand-stars` | startup | spot | 7 | `components/ActionsPanel.svelte`, `components/AiWaitingPolaroid.svelte`, `components/styleguide/ChromeSections.svelte`, `components/settings/AiKeyManager.svelte`, `components/admin/InviteLedger.svelte`, `design/iconTokens.ts`, `components/settings/sections.ts` |
| `whats-new` | deferred | spot | 3 | `components/settings/WhatsNewSection.svelte`, `design/iconTokens.ts`, `components/settings/sections.ts` |
