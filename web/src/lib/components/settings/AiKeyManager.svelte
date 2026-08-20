<script lang="ts">
  import { slide } from 'svelte/transition';
  import Icon from '../Icon.svelte';
  import Button from '../design/Button.svelte';
  import Disclosure from '../design/Disclosure.svelte';
  import StatusMessage from '../design/StatusMessage.svelte';
  import AiFeatureToggles from './AiFeatureToggles.svelte';
  import AiValueProp from './AiValueProp.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import { AI_CREATE_HELP, AI_CREATE_LABEL } from './aiSettingsCopy';
  import { SECTION_SLIDE } from './sections';
  import { settings, setAiImage, aiCredentialKind } from '$lib/state/settings.svelte';
  import { setAiUserApiKey } from '$lib/state/aiKey';
  import { setUserSubmittedAiAccessToken } from '$lib/state/aiAccessToken';
  import {
    verifyCredential,
    type CredentialKind,
    type VerifyCredentialResult,
  } from '$lib/aiCredential';
  import { parentalGateLink } from '$lib/actions/parentalGateLink';
  import {
    createLatestRequest,
    NETWORK_ERROR_MESSAGE,
    type SubmitStatus,
  } from '$lib/latestRequest';
  import { getPlatform, type Platform } from '$lib/platform';
  import { freeGenerations } from '$lib/state/freeGenerations.svelte';
  import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';

  // The copy for every kind-dependent outcome of a submission, so each terminal
  // branch of `submitKey` is a single lookup rather than an inline ternary.
  const KEY_MESSAGES: Record<
    'invalid' | 'saveFailed' | 'accepted',
    Record<CredentialKind, string>
  > = {
    invalid: {
      apiKey: "That key didn't work. Double-check it and try again.",
      accessCode: "That doesn't look like a valid key or access code. Please try again.",
      retiredGeminiKey:
        'That looks like a Google Gemini key. Splotch now uses OpenAI — create a key at platform.openai.com and paste that one instead.',
      // Deliberately not "that key didn't work": nothing was learned about the
      // key, and telling a parent their working credential is bad sends them off
      // to make another one.
      checkUnavailable: "We couldn't check that key just now. Please try again.",
    },
    saveFailed: {
      apiKey: 'Your key works, but could not be saved securely on this device. Please try again.',
      accessCode: 'Your credential works, but could not be saved securely.',
      // Unreachable: neither of these verifies, so neither reaches saving.
      retiredGeminiKey: 'That key could not be saved securely on this device.',
      checkUnavailable: 'That key could not be saved securely on this device.',
    },
    accepted: {
      apiKey: 'Your key works and has been accepted!',
      accessCode: 'Access granted! You have special access — no API key needed.',
      retiredGeminiKey: '',
      checkUnavailable: '',
    },
  };

  const KEY_STORAGE_NOTE: Record<Platform, string> = {
    ios: "Your key is saved in this device's iOS Keychain — encrypted by the system and kept only on this device.",
    android:
      "Your key is saved in this device's Android Keystore — encrypted by the system and kept only on this device.",
    web: 'Your key is encrypted and stored only in this browser on this device.',
  };

  interface Props {
    // `open` flips true when the Settings modal opens; we use it to clear
    // the input and any stale feedback, and to re-read the current platform.
    open?: boolean;
  }
  let { open = false }: Props = $props();

  // Drives the copy that tells the parent exactly where their API key is kept on
  // this platform.
  let platform = $state<Platform>('web');
  // The single AI field accepts either an OpenAI API key (BYOK) or a secret
  // access code. AI unlocks when the parent has provided either one.
  let keyInput = $state('');
  let keyStatus = $state<SubmitStatus>('idle');
  let keyMessage = $state('');
  let credentialKind = $derived(aiCredentialKind());
  let hasApiKey = $derived(credentialKind === 'apiKey');
  let aiLocked = $derived(credentialKind === 'none');
  const latest = createLatestRequest();

  // Show the saved key with everything but the last four characters masked, so
  // a parent can recognise it without exposing the whole secret.
  let maskedKey = $derived(maskSecret(settings.aiUserApiKey));

  function maskSecret(value: string) {
    if (!value) return '';
    if (value.length <= 4) return '*'.repeat(value.length);
    return '*'.repeat(value.length - 4) + value.slice(-4);
  }

  // How/where the key is stored, in plain language, per platform.
  let keyStorageNote = $derived(KEY_STORAGE_NOTE[platform]);

  function resetKeyFeedback() {
    keyStatus = 'idle';
    keyMessage = '';
  }

  $effect(() => {
    latest.cancel(); // opening or closing obsoletes any in-flight verify
    if (open) {
      platform = getPlatform();
      keyInput = '';
      resetKeyFeedback();
    }
  });

  // Throws when the credential could not be stored; returns false when a newer
  // submitKey superseded this one and its outcome should be discarded.
  async function persistCredential(
    result: VerifyCredentialResult,
    value: string,
    id: number
  ): Promise<boolean> {
    if (result.kind === 'apiKey') {
      await setAiUserApiKey(value, () => latest.isCurrent(id));
    } else {
      await setUserSubmittedAiAccessToken(result.accessCode || value, () => latest.isCurrent(id));
    }
    return latest.isCurrent(id);
  }

  async function submitKey() {
    const value = keyInput.trim();
    if (!value || keyStatus === 'busy') return;
    const { id, signal } = latest.begin();
    keyStatus = 'busy';
    keyMessage = '';

    try {
      const result = await verifyCredential(value, { signal });
      if (!latest.isCurrent(id)) return;

      if (!result.ok) {
        keyStatus = 'error';
        keyMessage = result.error || KEY_MESSAGES.invalid[result.kind];
        return;
      }

      let persisted: boolean;
      try {
        persisted = await persistCredential(result, value, id);
      } catch {
        if (latest.isCurrent(id)) {
          keyStatus = 'error';
          keyMessage = KEY_MESSAGES.saveFailed[result.kind];
        }
        return;
      }
      if (!persisted) return;

      // A verified credential submitted here is the explicit opt-in boundary in ADR-0127.
      setAiImage(true);
      keyInput = '';
      keyStatus = 'success';
      keyMessage = KEY_MESSAGES.accepted[result.kind];
    } catch {
      if (latest.isCurrent(id)) {
        keyStatus = 'error';
        keyMessage = NETWORK_ERROR_MESSAGE;
      }
    }
  }

  function forgetKey() {
    setAiUserApiKey('');
    keyInput = '';
    resetKeyFeedback();
  }

  async function forgetAccessCode() {
    await setUserSubmittedAiAccessToken('');
    keyInput = '';
    resetKeyFeedback();
  }
</script>

<div class="ai-settings-stack">
  <section class="setting-group ai-primary-toggle">
    <div class="setting">
      <ToggleRow
        icon="wand-stars"
        label={AI_CREATE_LABEL}
        id="aiImageToggle"
        checked={settings.aiImageEnabled}
        onToggle={setAiImage}
        help={settings.aiImageEnabled ? AI_CREATE_HELP.on : AI_CREATE_HELP.off}
      />
    </div>
  </section>

  {#if !settings.aiImageEnabled}
    <div transition:slide={SECTION_SLIDE}>
      <AiValueProp />
    </div>
  {/if}

  {#if settings.aiImageEnabled}
    <div class="ai-enabled-settings" transition:slide={SECTION_SLIDE}>
      <section class="setting-group">
        {#if aiLocked}
          <div class="setting byok">
            <p class="byok-intro">
              {#if freeGenerations.loading}
                <strong>Checking your free AI creations…</strong>
              {:else if freeGenerations.available && freeGenerations.remaining > 0}
                <strong
                  >{freeGenerations.remaining} free AI {freeGenerations.remaining === 1
                    ? 'creation'
                    : 'creations'} left.</strong
                >
                No setup is needed. After those are used, add your own OpenAI API key to keep creating.
              {:else if freeGenerations.available}
                <strong>Your {FREE_GENERATION_LIMIT} free AI creations are used up.</strong> Add your
                own OpenAI API key to keep creating.
              {:else}
                Add your own OpenAI API key to create AI art while the free allowance is
                unavailable.
              {/if}
              Your key is saved only on this device, used only for pictures made here, and billed to your
              OpenAI account. We never keep a copy of it.
            </p>

            <Disclosure class="byok-howto">
              {#snippet summary()}How do I get an OpenAI API key?{/snippet}
              <ol>
                <li>
                  Open <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    use:parentalGateLink>the OpenAI API keys page</a
                  >.
                </li>
                <li>Sign in, or create an OpenAI account.</li>
                <li>
                  Under <strong>Settings → Organization</strong>, finish
                  <strong>verification</strong>. OpenAI requires it before any key can make
                  pictures. Do this <em>before</em> the next step — a key made without it saves here perfectly
                  and then fails when the picture button is tapped.
                </li>
                <li>
                  Click <strong>Create new secret key</strong>, then copy it (it starts with
                  <code>sk-…</code>) and paste it below. You only get to see it once.
                </li>
              </ol>
              <p class="byok-howto-note">
                OpenAI bills picture-making usage to your account at its own rates, and requires the
                account to have billing set up before a key can make pictures. Sent an access code
                by us instead? Paste that in the same box — it works there too.
              </p>
            </Disclosure>

            <label class="access-code-label" for="aiKeyInput">OpenAI API Key</label>
            <div class="access-code-row">
              <input
                id="aiKeyInput"
                class="access-code-input"
                type="text"
                inputmode="text"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                placeholder="Paste your OpenAI API key"
                bind:value={keyInput}
                onkeydown={(e) => e.key === 'Enter' && submitKey()}
              />
              <Button
                variant="brand"
                class="access-code-submit"
                onclick={submitKey}
                disabled={!keyInput.trim() || keyStatus === 'busy'}
              >
                {keyStatus === 'busy' ? 'Checking…' : 'Save'}
              </Button>
            </div>
            <p class="byok-storage-note">
              <Icon name="lock" class="byok-storage-icon" />{keyStorageNote}
            </p>
          </div>
        {:else}
          <div class="setting byok byok-active">
            {#if hasApiKey}
              <p class="byok-intro">
                You're using <strong>your own OpenAI API key</strong>. Usage is billed to your
                OpenAI account. Forget the key any time to switch it off.
              </p>
              <label class="access-code-label" for="aiKeyActive">OpenAI API Key</label>
              <div class="access-code-row">
                <input
                  id="aiKeyActive"
                  class="access-code-input"
                  type="text"
                  readonly
                  aria-label="Saved OpenAI API key (masked)"
                  value={maskedKey}
                />
                <Button variant="danger" class="access-code-submit" onclick={forgetKey}
                  >Forget</Button
                >
              </div>
              <p class="byok-storage-note">
                <Icon name="lock" class="byok-storage-icon" />{keyStorageNote}
              </p>
            {:else}
              <p class="byok-intro">
                You have <strong>special access</strong> via an access code — AI art is on us, no API
                key needed. Forget the code any time to remove it.
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
                <Button variant="danger" class="access-code-submit" onclick={forgetAccessCode}>
                  Forget
                </Button>
              </div>
            {/if}
          </div>
        {/if}

        {#if keyMessage}
          <StatusMessage status={keyStatus === 'error' ? 'error' : 'success'}
            >{keyMessage}</StatusMessage
          >
        {/if}
      </section>

      <AiFeatureToggles />
    </div>
  {/if}
</div>

<style>
  .ai-settings-stack,
  .ai-enabled-settings {
    display: flex;
    flex-direction: column;
  }

  .ai-settings-stack {
    gap: var(--space-4);
  }

  .ai-enabled-settings {
    gap: var(--space-5);
  }

  .ai-settings-stack > section.ai-primary-toggle {
    margin-bottom: 0;
  }

  .ai-settings-stack > section.ai-primary-toggle > .setting {
    padding-bottom: 0;
  }

  /* AI access code entry */
  .access-code-label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
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
    font-size: var(--input-font-size);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text-strong);
  }

  .access-code-input:focus {
    outline: none;
    border-color: var(--brand);
  }

  /* Chrome comes from the Button primitive; the row only stops it shrinking
     next to the input. */
  .access-code-row :global(.access-code-submit) {
    flex-shrink: 0;
  }

  /* BYOK (bring your own key) panel */
  .byok-intro {
    margin: 0 0 12px 0;
    font-size: var(--font-size-sm);
    color: var(--text);
    line-height: 1.5;
  }

  .byok-active .byok-intro {
    color: var(--text-soft);
  }

  /* The how-to's own chrome on the Disclosure primitive — reached with
     :global() because the class lands on the primitive's own markup. */
  .byok :global(.byok-howto) {
    margin: 0 0 14px 0;
    background: var(--surface);
  }

  .byok :global(.byok-howto summary) {
    padding: 10px 12px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--brand);
  }

  .byok :global(.byok-howto ol) {
    margin: 0;
    padding: 0 16px 8px 32px;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.7;
  }

  .byok :global(.byok-howto a) {
    color: var(--brand);
    font-weight: var(--font-weight-semibold);
  }

  .byok :global(.byok-howto code) {
    background: var(--brand-wash);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    font-size: var(--font-size-xs);
  }

  .byok-howto-note {
    margin: 0;
    padding: 0 12px 12px;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
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
    color: var(--text-soft);
    font-family: var(--font-mono);
    letter-spacing: 0.5px;
  }
</style>
