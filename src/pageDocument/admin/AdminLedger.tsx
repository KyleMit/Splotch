import { css, html } from 'react-strict-dom';
import { timeAgo } from '../../lib/adminFormat';
import { colors, dimensions, fonts, motion } from '../../rsdDrawing/tokens.css';
import type { CodeUsage, Invite } from './adminApi';

// The console's "Access codes" table, the shipping InviteLedger. Explicit ARIA table roles keep the
// header-to-cell association whatever the flex layout does. Wide, each code's generation count and
// last use take columns of their own; narrower, they read as one line under the code. On a phone
// each row's actions take a second line of their own, so every action stays one tap away instead
// of behind a disclosure.

// Each listed code's tally, absent for a code added since it was read; null when the tallies are
// unavailable, which hides the usage columns rather than calling every code never used.
export type LedgerUsage = ReadonlyMap<string, CodeUsage | null> | null;

type CopyTarget = 'code' | 'url';

function copyKey(token: string, target: CopyTarget) {
  return `${token}:${target}`;
}

const COMPACT = '@media (max-width: 560px)';
// Where four columns would squeeze the code, its usage moves under it (shipping's breakpoint).
const STACKED = '@media (max-width: 800px)';
const STACKED_ONLY = '@media (min-width: 561px) and (max-width: 800px)';
const GENERATIONS_COLUMN_PX = 100;
const LAST_USED_COLUMN_PX = 120;
const ACTIONS_COLUMN_PX = 272;
const USAGE_SEPARATOR_INSET_PX = 4;
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
    display: { default: 'flex', [STACKED]: 'none' },
    flexDirection: 'row',
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
  codeHeader: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  generationsColumn: { flexShrink: 0, width: GENERATIONS_COLUMN_PX },
  lastUsedColumn: { flexShrink: 0, width: LAST_USED_COLUMN_PX },
  actionsColumn: { flexShrink: 0, width: ACTIONS_COLUMN_PX },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: { default: 0, [COMPACT]: '100%' },
    minWidth: 0,
  },
  token: {
    color: colors.textStrong,
    fontFamily: MONO_FAMILY,
    fontSize: dimensions.fontSizeSm,
    fontWeight: fonts.boldWeight,
    overflowWrap: 'anywhere',
  },
  usageLine: {
    display: { default: 'none', [STACKED]: 'block' },
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  usageCount: {
    color: colors.brandText,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  usageSeparator: { marginInline: USAGE_SEPARATOR_INSET_PX, color: colors.border },
  never: { fontStyle: 'italic' },
  generations: {
    display: { default: 'block', [STACKED]: 'none' },
    flexShrink: 0,
    width: GENERATIONS_COLUMN_PX,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  lastUsed: {
    display: { default: 'block', [STACKED]: 'none' },
    flexShrink: 0,
    width: LAST_USED_COLUMN_PX,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  noTally: {
    color: colors.textSoft,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
    fontStyle: 'italic',
  },
  noGenerations: { fontSize: dimensions.fontSizeSm },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    gap: dimensions.space2,
    flexShrink: 0,
    flexBasis: { default: 'auto', [COMPACT]: '100%' },
  },
  // The wide layout's fourth column, so its buttons line up under the Actions header.
  actionsBesideUsage: {
    width: { default: ACTIONS_COLUMN_PX, [STACKED_ONLY]: 'auto', [COMPACT]: '100%' },
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
  usage,
  busy,
  copied,
  onCopy,
  onRemove,
}: {
  invites: readonly Invite[];
  usage: LedgerUsage;
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
          <html.span role="columnheader" style={[styles.header, styles.codeHeader]}>
            Code
          </html.span>
          {usage ? (
            <>
              <html.span role="columnheader" style={[styles.header, styles.generationsColumn]}>
                Generations
              </html.span>
              <html.span role="columnheader" style={[styles.header, styles.lastUsedColumn]}>
                Last used
              </html.span>
            </>
          ) : null}
          <html.span role="columnheader" style={[styles.header, usage && styles.actionsColumn]}>
            Actions
          </html.span>
        </html.div>
      </html.div>
      <html.div role="rowgroup">
        {invites.map((invite, index) => (
          <InviteRow
            key={invite.token}
            invite={invite}
            usage={usage === null ? undefined : (usage.get(invite.token) ?? null)}
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

function UsageCells({ usage }: { usage: CodeUsage | null }) {
  if (usage === null)
    return (
      <>
        <html.span role="cell" style={[styles.generations, styles.noTally, styles.noGenerations]}>
          —
        </html.span>
        <html.span role="cell" style={[styles.lastUsed, styles.noTally]}>
          Never used
        </html.span>
      </>
    );
  return (
    <>
      <html.span role="cell" style={styles.generations}>
        {usage.count}
      </html.span>
      <html.span role="cell" style={styles.lastUsed}>
        {timeAgo(usage.lastUsed)}
      </html.span>
    </>
  );
}

function UsageLine({ usage }: { usage: CodeUsage | null }) {
  if (usage === null)
    return <html.span style={[styles.usageLine, styles.never]}>Never used</html.span>;
  return (
    <html.span style={styles.usageLine}>
      <html.strong style={styles.usageCount}>{usage.count}</html.strong>{' '}
      {usage.count === 1 ? 'generation' : 'generations'}
      <html.span aria-hidden style={styles.usageSeparator}>
        ·
      </html.span>
      {timeAgo(usage.lastUsed)}
    </html.span>
  );
}

function InviteRow({
  invite,
  usage,
  last,
  busy,
  copied,
  onCopy,
  onRemove,
}: {
  invite: Invite;
  // undefined: the tallies are unavailable, so the row shows none.
  usage: CodeUsage | null | undefined;
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
      <html.div role="cell" style={styles.info}>
        <html.span style={styles.token}>{invite.token}</html.span>
        {usage === undefined ? null : <UsageLine usage={usage} />}
      </html.div>
      {usage === undefined ? null : <UsageCells usage={usage} />}
      <html.div
        role="cell"
        style={[styles.actions, usage !== undefined && styles.actionsBesideUsage]}
      >
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
