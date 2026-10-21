import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts, motion } from '../../rsdDrawing/tokens.css';
import type { Invite } from './adminApi';

// The console's "Access codes" table, the shipping InviteLedger without its usage columns, which
// the bearer API does not carry. Explicit ARIA table roles keep the header-to-cell association
// whatever the flex layout does. On a phone each row's actions take a second line of their own,
// so every action stays one tap away instead of behind a disclosure.

type CopyTarget = 'code' | 'url';

function copyKey(token: string, target: CopyTarget) {
  return `${token}:${target}`;
}

const COMPACT = '@media (max-width: 560px)';
const ROW_INSET_PX = 20;
const HEAD_PADDING_BLOCK_PX = 10;
const HEAD_TRACKING = '0.06em';
const ACTION_TARGET_PX = 44;
const ACTION_PADDING_INLINE_PX = 14;
const DISABLED_ACTION_OPACITY = 0.6;
const EMPTY_MAX_WIDTH_PX = 320;
const MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const styles = css.create({
  ledger: {
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    borderColor: colors.border,
    borderRadius: dimensions.radiusLg,
    overflow: 'hidden',
  },
  headRow: {
    display: { default: 'flex', [COMPACT]: 'none' },
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: dimensions.space2,
    paddingBlock: HEAD_PADDING_BLOCK_PX,
    paddingLeft: ROW_INSET_PX,
    paddingRight: dimensions.space2,
    backgroundColor: colors.surface2,
    borderBottomStyle: 'solid',
    borderBottomWidth: dimensions.borderWidth,
    borderBottomColor: colors.border,
  },
  header: {
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    letterSpacing: HEAD_TRACKING,
    textTransform: 'uppercase',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: { default: 'nowrap', [COMPACT]: 'wrap' },
    alignItems: 'center',
    gap: dimensions.space2,
    paddingBlock: dimensions.space2,
    paddingLeft: { default: ROW_INSET_PX, [COMPACT]: dimensions.space4 },
    paddingRight: { default: dimensions.space2, [COMPACT]: dimensions.space4 },
    borderBottomStyle: 'solid',
    borderBottomWidth: dimensions.borderWidth,
    borderBottomColor: colors.border,
  },
  lastRow: { borderBottomWidth: 0 },
  token: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: { default: 0, [COMPACT]: '100%' },
    minWidth: 0,
    color: colors.textStrong,
    fontFamily: MONO_FAMILY,
    fontSize: dimensions.fontSizeSm,
    fontWeight: fonts.boldWeight,
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    gap: dimensions.space2,
    flexBasis: { default: 'auto', [COMPACT]: '100%' },
  },
  action: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    minHeight: ACTION_TARGET_PX,
    paddingBlock: 0,
    paddingInline: ACTION_PADDING_INLINE_PX,
    color: colors.brandText,
    backgroundColor: {
      default: colors.surface,
      '@media (hover: hover)': { default: colors.surface, ':hover': colors.brandWash },
    },
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    borderColor: colors.borderWarmStrong,
    borderRadius: dimensions.radiusSm,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transitionProperty: 'background-color, color, border-color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
  copied: {
    color: colors.successText,
    borderColor: colors.successText,
    backgroundColor: colors.successWash,
  },
  danger: {
    color: colors.dangerText,
    backgroundColor: {
      default: colors.surface,
      '@media (hover: hover)': { default: colors.surface, ':hover': colors.dangerWash },
    },
  },
  disabled: { opacity: DISABLED_ACTION_OPACITY, cursor: 'auto' },
  empty: {
    margin: 0,
    marginInline: 'auto',
    maxWidth: EMPTY_MAX_WIDTH_PX,
    paddingBlock: dimensions.space6,
    paddingInline: dimensions.space3,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    textAlign: 'center',
  },
});

export function AdminLedger({
  invites,
  busy,
  copied,
  onCopy,
  onRemove,
}: {
  invites: readonly Invite[];
  busy: boolean;
  // The copyKey of the action showing "Copied!", or ''.
  copied: string;
  onCopy: (key: string, text: string, announcement: string) => void;
  onRemove: (token: string) => void;
}) {
  if (invites.length === 0)
    return (
      <html.div style={styles.ledger}>
        <html.p style={styles.empty}>
          No access codes yet. Add one above to start handing out invites.
        </html.p>
      </html.div>
    );
  return (
    <html.div role="table" aria-label="Access codes" style={styles.ledger}>
      <html.div role="rowgroup">
        <html.div role="row" style={styles.headRow}>
          <html.span role="columnheader" style={styles.header}>
            Code
          </html.span>
          <html.span role="columnheader" style={styles.header}>
            Actions
          </html.span>
        </html.div>
      </html.div>
      <html.div role="rowgroup">
        {invites.map((invite, index) => (
          <InviteRow
            key={invite.token}
            invite={invite}
            last={index === invites.length - 1}
            busy={busy}
            copied={copied}
            onCopy={onCopy}
            onRemove={onRemove}
          />
        ))}
      </html.div>
    </html.div>
  );
}

function InviteRow({
  invite,
  last,
  busy,
  copied,
  onCopy,
  onRemove,
}: {
  invite: Invite;
  last: boolean;
  busy: boolean;
  copied: string;
  onCopy: (key: string, text: string, announcement: string) => void;
  onRemove: (token: string) => void;
}) {
  const codeCopied = copied === copyKey(invite.token, 'code');
  const linkCopied = copied === copyKey(invite.token, 'url');
  return (
    <html.div role="row" style={[styles.row, last && styles.lastRow]}>
      <html.span role="cell" style={styles.token}>
        {invite.token}
      </html.span>
      <html.div role="cell" style={styles.actions}>
        <html.button
          type="button"
          aria-label={`${codeCopied ? 'Copied' : 'Copy'} ${invite.token}`}
          onClick={() =>
            onCopy(copyKey(invite.token, 'code'), invite.token, `Copied ${invite.token}`)
          }
          style={[styles.action, codeCopied && styles.copied]}
        >
          {codeCopied ? 'Copied!' : 'Copy'}
        </html.button>
        <html.button
          type="button"
          aria-label={`${linkCopied ? 'Copied link' : 'Copy link'} for ${invite.token}`}
          onClick={() =>
            onCopy(copyKey(invite.token, 'url'), invite.url, `Copied link for ${invite.token}`)
          }
          style={[styles.action, linkCopied && styles.copied]}
        >
          {linkCopied ? 'Copied!' : 'Copy link'}
        </html.button>
        <html.button
          type="button"
          aria-label={`Remove ${invite.token}`}
          disabled={busy}
          onClick={() => onRemove(invite.token)}
          style={[styles.action, styles.danger, busy && styles.disabled]}
        >
          Remove
        </html.button>
      </html.div>
    </html.div>
  );
}
