export const STORAGE_KEYS = {
  soundEnabled: 'splotch-sound-enabled',
  drawingSoundEnabled: 'splotch-drawing-sound-enabled',
  deleteSoundEnabled: 'splotch-delete-sound-enabled',
  soundVolume: 'splotch-sound-volume',
  actionButtonScale: 'splotch-action-button-scale',
  saveOnDelete: 'splotch-save-on-delete',
  screenshotEnabled: 'splotch-screenshot-enabled',
  undoButtonEnabled: 'splotch-undo-button-enabled',
  strokeWidthControl: 'splotch-stroke-width-control',
  crayonEnabled: 'splotch-crayon-enabled',
  magicBrushEnabled: 'splotch-magic-brush-enabled',
  eraserEnabled: 'splotch-eraser-enabled',
  coloringBookEnabled: 'splotch-coloring-book-enabled',
  coloringPacksAllowMetered: 'splotch-coloring-packs-allow-metered',
  aiImageEnabled: 'splotch-ai-image-enabled',
  lastNetworkOnline: 'splotch-last-network-online',
  aiCustomizationEnabled: 'splotch-ai-customization-enabled',
  autoSaveAi: 'splotch-auto-save-ai',
  legacyAiAccessToken: 'splotch-ai-access-token',
  toolDrawer: 'splotch-tool-drawer-enabled',
  drawerOpen: 'splotch-drawer-open',
  lockRotation: 'splotch-lock-rotation',
  forceLandscape: 'splotch-force-landscape',
  pencilEraserEnabled: 'splotch-pencil-eraser-enabled',
  applePencilSeen: 'splotch-apple-pencil-seen',
  theme: 'splotch-theme',
  reduceMotion: 'splotch-reduce-motion',
  toolbarStyle: 'splotch-toolbar-style',
  brushType: 'splotch-brush-type',
  strokeWidthSize: 'splotch-stroke-width-size',
  eraserWidthSize: 'splotch-eraser-width-size',
  installDismissed: 'splotch-install-dismissed',
  installCompleted: 'splotch-install-completed',
  installRepromptSessionCount: 'splotch-install-reprompt-session-count',
  installRepromptsUsed: 'splotch-install-reprompts-used',
  legacyAiUserApiKey: 'splotch-ai-user-api-key',
  freeGenerationInstallation: 'splotch-free-generation-installation-v1',
  freeGenerationBadgeHint: 'splotch-free-generation-badge-hint',
  // The web-vault rows a successful read has found missing, as a JSON name
  // list, so boot can skip opening the database once every row is accounted
  // for. Written and read only by secureStorage (noteSecretAbsent /
  // secureVaultKnownEmpty), which is where a failed read can still be told
  // apart from an absent row.
  secureVaultEmpty: 'splotch-secure-vault-empty',
  // Keys whose native Preferences removal has not landed, as a JSON key list.
  // removeKey records the key before asking Preferences to forget it and
  // clears it once that succeeds; hydrateDurableStorage retries a listed
  // removal instead of restoring the copy it left behind (storage.ts).
  pendingDurableRemovals: 'splotch-pending-durable-removals',
  saveFolderChosen: 'splotch-save-folder-chosen',
  // Records that unsaved pictures wait in IndexedDB (unsavedPictureStore.ts), so a boot with
  // nothing to retry never opens that database.
  unsavedPicturesHeld: 'splotch-unsaved-pictures-held',
  parentalGateAiImageMode: 'splotch-parental-gate-ai-image-mode',
  parentalGateImageReportMode: 'splotch-parental-gate-image-report-mode',
  parentalGateExternalLinksMode: 'splotch-parental-gate-external-links-mode',
  parentalGateFeedbackMode: 'splotch-parental-gate-feedback-mode',
  parentalGateParentCenterMode: 'splotch-parental-gate-parent-center-mode',
  parentSectionsSeen: 'splotch-parent-sections-seen',
  settingsActivitySessionCount: 'splotch-settings-activity-session-count',
  legacyGateRememberMode: 'splotch-gate-remember-mode',
  legacyGateUnlockedForever: 'splotch-gate-unlocked',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// Keys only the web build writes: the PWA install prompt, the web
// free-generation identity (native derives its own from Device.getId()), and
// the web vault's known-absent list. Native durable hydration neither fetches
// nor forgets them (storage.ts), so a value native wrote under one would not
// survive a WebView eviction. storageKeys.webOnly.test.ts holds every writer to
// the guard that keeps it off native. saveFolderChosen stays out: only a
// runtime showDirectoryPicker probe keeps its writer off native.
//
// Listed by value, which the StorageKey annotation checks, rather than as
// STORAGE_KEYS reads: the bundler keeps a module-level property read even when
// nothing uses the list, and the web build never does.
export const WEB_ONLY_STORAGE_KEYS: readonly StorageKey[] = [
  'splotch-install-dismissed',
  'splotch-install-completed',
  'splotch-install-reprompt-session-count',
  'splotch-install-reprompts-used',
  'splotch-free-generation-installation-v1',
  'splotch-secure-vault-empty',
];
