<script lang="ts">
  import { slide } from 'svelte/transition';
  import Icon from '../Icon.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import {
    settings,
    setAiImage,
    setAiCustomization,
    setAutoSaveAi,
    setAiAccessToken,
    setAiUserApiKey,
  } from '$lib/state/settings.svelte';
  import { apiUrl } from '$lib/api';
  import { getPlatform, type Platform } from '$lib/platform';

  interface Props {
    // `open` flips true when the Parent Center modal opens; we use it to clear
    // the input and any stale feedback, and to re-read the current platform.
    open?: boolean;
  }
  let { open = false }: Props = $props();

  // Drives the copy that tells the parent exactly where their API key is kept on
  // this platform.
  let platform = $state<Platform>('web');
  // The single AI field accepts either a Gemini API key (BYOK) or a secret
  // access code. AI unlocks when the parent has provided either one.
  let keyInput = $state('');
  let keyStatus = $state<'idle' | 'checking' | 'error' | 'success'>('idle');
  let keyMessage = $state('');
  let hasApiKey = $derived(!!settings.aiUserApiKey);
  let hasAccessCode = $derived(!!settings.aiAccessToken);
  let aiLocked = $derived(!hasApiKey && !hasAccessCode);
  let activeVerification = 0;
  let verificationController: AbortController | null = null;

  // Show the saved key with everything but the last four characters masked, so
  // a parent can recognise it without exposing the whole secret.
  let maskedKey = $derived(maskSecret(settings.aiUserApiKey));

  function maskSecret(value: string) {
    if (!value) return '';
    if (value.length <= 4) return '*'.repeat(value.length);
    return '*'.repeat(value.length - 4) + value.slice(-4);
  }

  // How/where the key is stored, in plain language, per platform.
  let keyStorageNote = $derived(
    platform === 'ios'
      ? "Your key is saved in this device's iOS Keychain — encrypted by the system and kept only on this device"
      : platform === 'android'
        ? "Your key is saved in this device's Android Keystore — encrypted by the system and kept only on this device."
        : 'Your key is encrypted and stored only in this browser on this device.'
  );

  function resetKeyFeedback() {
    keyStatus = 'idle';
    keyMessage = '';
  }

  function invalidateVerification() {
    activeVerification += 1;
    verificationController?.abort();
    verificationController = null;
  }

  $effect(() => {
    const isOpen = open;
    invalidateVerification();
    if (isOpen) {
      platform = getPlatform();
      keyInput = '';
      resetKeyFeedback();
    }
  });

  type VerifyResponse = { ok?: boolean; error?: string; accessCode?: string };

  async function verifyAndSave(opts: {
    endpoint: string;
    body: Record<string, string>;
    persist: (data: VerifyResponse) => unknown | Promise<unknown>;
    successMessage: string;
    failureMessage: (data: VerifyResponse) => string;
    storageFailureMessage?: string;
    requestId: number;
    signal: AbortSignal;
  }): Promise<boolean> {
    const res = await fetch(apiUrl(opts.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
    const data: VerifyResponse = await res.json().catch(() => ({}));
    if (opts.requestId !== activeVerification) return false;
    if (res.ok && data.ok) {
      try {
        await opts.persist(data);
      } catch {
        if (opts.requestId === activeVerification) {
          keyStatus = 'error';
          keyMessage =
            opts.storageFailureMessage || 'Your credential works, but could not be saved securely.';
        }
        return false;
      }
      if (opts.requestId !== activeVerification) return false;
      setAiImage(true); // turn the feature on the moment a valid credential lands
      keyInput = '';
      keyStatus = 'success';
      keyMessage = opts.successMessage;
      return true;
    } else {
      keyStatus = 'error';
      keyMessage = opts.failureMessage(data);
      return false;
    }
  }

  async function submitKey() {
    const value = keyInput.trim();
    if (!value || keyStatus === 'checking') return;
    invalidateVerification();
    const requestId = activeVerification;
    const controller = new AbortController();
    verificationController = controller;
    keyStatus = 'checking';
    keyMessage = '';

    // Gemini API keys are issued in the form "AIza…". Treat anything else as a
    // secret access code and check it against the managed allowlist instead.
    const looksLikeApiKey = /^AIza/.test(value);

    try {
      if (looksLikeApiKey) {
        await verifyAndSave({
          endpoint: '/api/verify-key',
          body: { apiKey: value },
          persist: () => setAiUserApiKey(value, () => requestId === activeVerification),
          successMessage: 'Your key works and has been accepted!',
          failureMessage: (data) =>
            data.error || "That key didn't work. Double-check it and try again.",
          storageFailureMessage:
            'Your key works, but could not be saved securely on this device. Please try again.',
          requestId,
          signal: controller.signal,
        });
      } else {
        await verifyAndSave({
          endpoint: '/api/verify-access-code',
          body: { code: value },
          persist: (data) => setAiAccessToken(data.accessCode || value),
          successMessage: 'Access granted! You have special access — no API key needed.',
          failureMessage: (data) =>
            data.error || "That doesn't look like a valid key or access code. Please try again.",
          requestId,
          signal: controller.signal,
        });
      }
    } catch {
      if (requestId === activeVerification) {
        keyStatus = 'error';
        keyMessage = 'Could not reach the server. Check your connection and try again.';
      }
    } finally {
      if (requestId === activeVerification) verificationController = null;
    }
  }

  function forgetKey() {
    setAiUserApiKey('');
    keyInput = '';
    resetKeyFeedback();
  }

  function forgetAccessCode() {
    setAiAccessToken('');
    keyInput = '';
    resetKeyFeedback();
  }
</script>

<section class="setting-group">
  {#if aiLocked}
    <div class="setting byok">
      <p class="byok-intro">
        Splotch turns drawings into AI art with Google's Gemini. To keep the app free with no
        accounts, you <strong>bring your own key</strong> (BYOK): you paste a Gemini API key, it's saved
        only on this device, and it's used only for your child's creations. Any usage is billed to your
        own Google account. We never keep a copy of your key.
      </p>

      <details class="byok-howto">
        <summary>How do I get a Gemini API key?</summary>
        <ol>
          <li>
            Open <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer">Google AI Studio</a
            >.
          </li>
          <li>Sign in with a Google account.</li>
          <li>Click <strong>Create API key</strong> and confirm.</li>
          <li>Copy the key (it starts with <code>AIza…</code>) and paste it below.</li>
        </ol>
        <p class="byok-howto-note">The free tier is generous and is plenty for occasional use.</p>
      </details>

      <label class="access-code-label" for="aiKeyInput">Gemini API Key</label>
      <div class="access-code-row">
        <input
          id="aiKeyInput"
          class="access-code-input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Paste your Gemini API key"
          bind:value={keyInput}
          onkeydown={(e) => e.key === 'Enter' && submitKey()}
        />
        <button
          class="access-code-submit"
          onclick={submitKey}
          disabled={!keyInput.trim() || keyStatus === 'checking'}
        >
          {keyStatus === 'checking' ? 'Checking…' : 'Save'}
        </button>
      </div>
      <p class="byok-storage-note">
        <Icon name="lock" class="byok-storage-icon" />{keyStorageNote}
      </p>
      <p class="byok-secret-hint">Have an access code? You can enter it here too.</p>
    </div>
  {:else}
    <div class="setting byok byok-active">
      {#if hasApiKey}
        <p class="byok-intro">
          You're using <strong>your own Gemini API key</strong>. Usage is billed to your Google
          account. Forget the key any time to switch it off.
        </p>
        <label class="access-code-label" for="aiKeyActive">Gemini API Key</label>
        <div class="access-code-row">
          <input
            id="aiKeyActive"
            class="access-code-input"
            type="text"
            readonly
            aria-label="Saved Gemini API key (masked)"
            value={maskedKey}
          />
          <button class="access-code-submit forget" onclick={forgetKey}>Forget</button>
        </div>
        <p class="byok-storage-note">
          <Icon name="lock" class="byok-storage-icon" />{keyStorageNote}
        </p>
      {:else}
        <p class="byok-intro">
          You have <strong>special access</strong> via an access code — AI art is on us, no API key needed.
          Forget the code any time to remove it.
        </p>
        <label class="access-code-label" for="aiCodeActive">Access Code</label>
        <div class="access-code-row">
          <input
            id="aiCodeActive"
            class="access-code-input"
            type="text"
            readonly
            aria-label="Saved access code"
            value={settings.aiAccessToken}
          />
          <button class="access-code-submit forget" onclick={forgetAccessCode}>Forget</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if keyMessage}
    <p
      class="byok-message"
      class:error={keyStatus === 'error'}
      class:success={keyStatus === 'success'}
      role={keyStatus === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {keyMessage}
    </p>
  {/if}

  {#if !aiLocked}
    <div class="ai-controls">
      <div class="setting">
        <ToggleRow
          icon="wand-stars"
          label="Create AI Images"
          id="aiImageToggle"
          checked={settings.aiImageEnabled}
          onToggle={setAiImage}
        />
      </div>

      {#if settings.aiImageEnabled}
        <div class="setting" transition:slide={{ duration: 220 }}>
          <ToggleRow
            icon="customize"
            label="AI Customization"
            id="aiCustomizationToggle"
            checked={settings.aiCustomizationEnabled}
            onToggle={setAiCustomization}
          />
        </div>

        <div class="setting" transition:slide={{ duration: 220 }}>
          <ToggleRow
            icon="download"
            label="Auto-Save AI Images"
            id="autoSaveAiToggle"
            checked={settings.autoSaveAiEnabled}
            onToggle={setAutoSaveAi}
            help="Saves each AI image and the drawing to your photos, and shows a larger preview"
          />
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* AI feature toggles — spaced off from the key/code panel above them. */
  .ai-controls {
    margin-top: 24px;
  }

  /* AI access code entry */
  .access-code-label {
    display: block;
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--text);
    margin-bottom: 4px;
  }

  .access-code-row {
    display: flex;
    gap: 8px;
  }

  .access-code-input {
    flex: 1;
    min-width: 0;
    padding: 8px 12px;
    /* Never below 16px: iOS Safari / WKWebView zoom the visual viewport when a
       focused input's font-size is < 16px, and on the drawing route that would
       strand the canvas zoomed with no way to reset it (ADR-0076). */
    font-size: max(16px, var(--font-size-md));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-strong);
  }

  .access-code-input:focus {
    outline: none;
    border-color: var(--brand);
  }

  .access-code-submit {
    padding: 8px 16px;
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--on-brand);
    background: var(--brand);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--duration-base) ease;
    flex-shrink: 0;
  }

  @media (hover: hover) {
    .access-code-submit:hover {
      background: var(--brand-hover);
    }
  }

  .access-code-submit:disabled {
    background: var(--control-track-hover);
    cursor: not-allowed;
  }

  /* BYOK (bring your own key) panel */
  .byok-intro {
    margin: 0 0 12px 0;
    font-size: var(--font-size-sm);
    color: var(--text);
    line-height: 1.5;
  }

  .byok-active .byok-intro {
    color: var(--text-mid);
  }

  .byok-howto {
    margin: 0 0 14px 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    overflow: hidden;
  }

  .byok-howto summary {
    padding: 10px 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--brand);
    cursor: pointer;
    user-select: none;
    list-style: none;
  }

  .byok-howto summary::-webkit-details-marker {
    display: none;
  }

  .byok-howto summary::after {
    content: '›';
    float: right;
    color: var(--text-faint);
    transition: transform var(--duration-base) ease;
  }

  .byok-howto[open] summary::after {
    transform: rotate(90deg);
  }

  .byok-howto ol {
    margin: 0;
    padding: 0 16px 8px 32px;
    color: var(--text-mid);
    font-size: var(--font-size-sm);
    line-height: 1.7;
  }

  .byok-howto a {
    color: var(--brand);
    font-weight: 600;
  }

  .byok-howto code {
    background: var(--brand-wash);
    border-radius: var(--radius-xs);
    padding: 1px 5px;
    font-size: var(--font-size-xs);
  }

  .byok-howto-note {
    margin: 0;
    padding: 0 12px 12px;
    font-size: var(--font-size-xs);
    color: var(--text-faint);
  }

  .byok-secret-hint {
    margin: 10px 0 0 0;
    font-size: var(--font-size-xs);
    color: var(--text-faint);
  }

  /* "Here's where your key lives" reassurance line. */
  .byok-storage-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 10px 0 0 0;
    font-size: var(--font-size-xs);
    line-height: 1.45;
    color: var(--success-text);
  }

  .byok-active .byok-storage-note {
    margin-top: 8px;
  }

  :global(.byok-storage-icon) {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  :global(.byok-storage-icon svg) {
    fill: currentColor;
  }

  .access-code-input[readonly] {
    background: var(--surface-hover);
    color: var(--text-muted);
    font-family: 'Courier New', monospace;
    letter-spacing: 0.5px;
  }

  .access-code-submit.forget {
    background: var(--slider-track);
    color: var(--danger-text);
  }

  @media (hover: hover) {
    .access-code-submit.forget:hover {
      background: var(--control-track);
    }
  }

  .byok-message {
    margin: 12px 0 0 0;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .byok-message.success {
    background: var(--success-wash);
    color: var(--success-text);
  }

  .byok-message.error {
    background: var(--danger-wash);
    color: var(--danger-text);
  }
</style>
