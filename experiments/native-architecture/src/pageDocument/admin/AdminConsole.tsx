import { useId, useState } from 'react';
import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts, motion } from '../../rsdDrawing/tokens.css';
import { SHOWN_WITHOUT_SCRIPT_ATTRIBUTE } from '../../rsdDrawing/pageFrame';
import type { AdminApi, TokenSnapshot } from './adminApi';
import { ADMIN_RESTORING_ATTRIBUTE, type AdminTheme } from './adminContract';
import type { AdminSessionStore } from './adminSession';
import {
  AdminAnnouncement,
  AdminButton,
  AdminHiddenLabel,
  AdminPage,
  AdminRuleLabel,
  AdminSection,
  AdminStatusMessage,
} from './adminChrome';
import { AdminLedger } from './AdminLedger';
import { useAdminConsole, type Flash } from './useAdminConsole';

const COMPACT = '@media (max-width: 560px)';
const FIELD_PADDING = { block: '13px', inline: '16px' } as const;
const FIELD_MAX_WIDTH_PX = 420;
const SIGN_IN_MAX_WIDTH_PX = 480;
const FORM_GAP_PX = 10;
const MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const styles = css.create({
  sections: { display: 'flex', flexDirection: 'column', gap: dimensions.space8 },
  form: { display: 'flex', flexDirection: 'row', gap: FORM_GAP_PX },
  signInForm: { width: '100%', maxWidth: SIGN_IN_MAX_WIDTH_PX, marginInline: 'auto' },
  field: {
    boxSizing: 'border-box',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: FIELD_MAX_WIDTH_PX,
    paddingBlock: FIELD_PADDING.block,
    paddingInline: FIELD_PADDING.inline,
    color: colors.textStrong,
    backgroundColor: colors.surface,
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    borderColor: { default: colors.borderWarmStrong, ':focus': colors.brandSolid },
    borderRadius: dimensions.radiusMd,
    fontSize: dimensions.fontSizeMd,
    fontFamily: fonts.family,
    transitionProperty: 'border-color',
    transitionDuration: motion.durationFast,
  },
  fullLabel: { display: { default: 'inline', [COMPACT]: 'none' } },
  shortLabel: { display: { default: 'none', [COMPACT]: 'inline' } },
  quiet: { margin: 0, color: colors.textSoft, fontSize: dimensions.fontSizeSm },
  hiddenUntilRestored: { display: 'none' },
  code: { fontFamily: MONO_FAMILY, fontSize: '0.9em' },
});

export function AdminConsole({
  theme,
  api,
  sessions,
  confirm,
  writeClipboard,
}: {
  theme: AdminTheme;
  api: AdminApi;
  sessions: AdminSessionStore;
  confirm: (message: string) => boolean;
  writeClipboard: (text: string) => Promise<void>;
}) {
  const admin = useAdminConsole({ api, sessions, confirm, writeClipboard });
  const { view } = admin;
  const signedIn =
    view.mode === 'loading' || view.mode === 'unavailable' || view.mode === 'signedIn';
  return (
    <AdminPage
      theme={theme}
      actions={
        signedIn ? (
          <AdminButton variant="wash" size="md" disabled={admin.busy} onPress={admin.signOut}>
            Sign out
          </AdminButton>
        ) : null
      }
    >
      {view.mode === 'restoring' || view.mode === 'signedOut' ? (
        <SignIn
          restoring={view.mode === 'restoring'}
          error={view.mode === 'signedOut' ? view.error : null}
          busy={admin.busy}
          onSignIn={admin.signIn}
        />
      ) : null}
      {view.mode === 'restoring' ? (
        <html.p
          {...{ [ADMIN_RESTORING_ATTRIBUTE]: 'loading' }}
          style={[styles.quiet, styles.hiddenUntilRestored]}
        >
          Loading access codes…
        </html.p>
      ) : null}
      {view.mode === 'loading' ? <html.p style={styles.quiet}>Loading access codes…</html.p> : null}
      {view.mode === 'unavailable' ? (
        <AdminSection>
          <AdminStatusMessage status="error">
            The access codes could not be loaded. Check your connection and try again.
          </AdminStatusMessage>
          <html.div>
            <AdminButton
              variant="brand"
              size="lg"
              disabled={admin.busy}
              onPress={() => void admin.retry(view.session)}
            >
              Try again
            </AdminButton>
          </html.div>
        </AdminSection>
      ) : null}
      {view.mode === 'signedIn' ? (
        <AccessCodes
          snapshot={view.snapshot}
          flash={admin.flash}
          busy={admin.busy}
          draft={admin.draft}
          onDraft={admin.setDraft}
          onAdd={() => void admin.add(view.session)}
          onRemove={(token) => void admin.remove(view.session, token)}
          copied={admin.copied?.key ?? ''}
          announcement={admin.copied?.announcement ?? ''}
          onCopy={(key, text, announcement) => void admin.copy(key, text, announcement)}
        />
      ) : null}
    </AdminPage>
  );
}

function onEnter(action: () => void) {
  return (event: { key: string }) => {
    if (event.key === 'Enter') action();
  };
}

// No <form>: React Strict DOM has none, and without one nothing can submit the key as a GET
// before the entry has loaded. The field carries no name for the same reason, and takes no typing
// until the entry has hydrated it, so no key typed early is dropped.
function SignIn({
  restoring,
  error,
  busy,
  onSignIn,
}: {
  restoring: boolean;
  error: string | null;
  busy: boolean;
  onSignIn: (key: string) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const fieldId = useId();
  const disabled = restoring || busy;
  const submit = () => {
    if (disabled || !key) return;
    void onSignIn(key);
  };
  return (
    <html.div {...(restoring ? { [ADMIN_RESTORING_ATTRIBUTE]: 'sign-in' } : {})}>
      <AdminSection>
        <AdminRuleLabel>Sign in</AdminRuleLabel>
        <html.p
          {...{ [SHOWN_WITHOUT_SCRIPT_ATTRIBUTE]: true }}
          style={[styles.quiet, styles.hiddenUntilRestored]}
        >
          The admin console needs JavaScript to sign in.
        </html.p>
        {error ? <AdminStatusMessage status="error">{error}</AdminStatusMessage> : null}
        <html.div style={[styles.form, styles.signInForm]}>
          <AdminHiddenLabel field={fieldId}>Admin access key</AdminHiddenLabel>
          <html.input
            id={fieldId}
            type="password"
            disabled={restoring}
            placeholder="Admin access key"
            autoComplete="current-password"
            autoCapitalize="off"
            spellCheck={false}
            value={key}
            onChange={(event: { target: { value: string } }) => setKey(event.target.value)}
            onKeyDown={onEnter(submit)}
            style={styles.field}
          />
          <AdminButton variant="brand" size="lg" disabled={disabled} onPress={submit}>
            Sign in
          </AdminButton>
        </html.div>
      </AdminSection>
    </html.div>
  );
}

function AccessCodes({
  snapshot,
  flash,
  busy,
  draft,
  onDraft,
  onAdd,
  onRemove,
  copied,
  announcement,
  onCopy,
}: {
  snapshot: TokenSnapshot;
  flash: Flash | null;
  busy: boolean;
  draft: string;
  onDraft: (draft: string) => void;
  onAdd: () => void;
  onRemove: (token: string) => void;
  copied: string;
  announcement: string;
  onCopy: (key: string, text: string, announcement: string) => void;
}) {
  const fieldId = useId();
  const add = () => {
    if (!busy && draft.trim()) onAdd();
  };
  return (
    <html.div style={styles.sections}>
      <AdminSection>
        <AdminRuleLabel count={snapshot.invites.length}>Access codes</AdminRuleLabel>
        {snapshot.persistent ? null : (
          <AdminStatusMessage status="warning">
            <html.strong>Netlify Blobs is unavailable.</html.strong> You&apos;re viewing a
            local-only copy seeded from the{' '}
            <html.code style={styles.code}>ALLOWED_TOKENS_LIST</html.code> env var. Any codes you
            add or remove here won&apos;t be saved — the change is either refused outright or lost
            on the next restart.
          </AdminStatusMessage>
        )}
        {flash ? <AdminStatusMessage status={flash.kind}>{flash.text}</AdminStatusMessage> : null}
        <html.div style={styles.form}>
          <AdminHiddenLabel field={fieldId}>New access code</AdminHiddenLabel>
          <html.input
            id={fieldId}
            type="text"
            placeholder="Add a code…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={draft}
            onChange={(event: { target: { value: string } }) => onDraft(event.target.value)}
            onKeyDown={onEnter(add)}
            style={styles.field}
          />
          <AdminButton variant="brand" size="lg" disabled={busy} label="Add code" onPress={add}>
            <html.span style={styles.fullLabel}>Add code</html.span>
            <html.span style={styles.shortLabel}>Add</html.span>
          </AdminButton>
        </html.div>
        <AdminLedger
          invites={snapshot.invites}
          busy={busy}
          copied={copied}
          onCopy={onCopy}
          onRemove={onRemove}
        />
        <AdminAnnouncement>{announcement}</AdminAnnouncement>
      </AdminSection>
    </html.div>
  );
}
