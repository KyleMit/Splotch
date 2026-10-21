import { css, html } from 'react-strict-dom';
import { FREE_GENERATION_LIMIT } from '../../../../../web/src/lib/freeGenerations';
import { colors, dimensions, fonts } from '../../rsdDrawing/tokens.css';
import type { GrantStats } from './adminApi';
import { AdminRuleLabel, AdminSection, AdminStatusMessage } from './adminChrome';

// The console's "Free generation grants" panel, shipping AdminConsole's: today's provider starts
// against the daily ceiling, the figures summed over the sampled grant records, and the most
// recently active of those records.

const METRIC_MIN_WIDTH_PX = 120;
const TABLE_MIN_WIDTH_PX = 480;
const MONO_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const styles = css.create({
  metrics: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(${METRIC_MIN_WIDTH_PX}px, 1fr))`,
    gap: dimensions.space3,
  },
  metric: {
    padding: dimensions.space3,
    borderStyle: 'solid',
    borderWidth: dimensions.borderWidth,
    borderColor: colors.border,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.surface2,
  },
  label: {
    display: 'block',
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
  },
  value: {
    display: 'block',
    marginTop: dimensions.space1,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeXl,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  tableWrap: { overflowX: 'auto' },
  table: { minWidth: TABLE_MIN_WIDTH_PX, fontSize: dimensions.fontSizeSm },
  row: {
    display: 'flex',
    flexDirection: 'row',
    borderBottomStyle: 'solid',
    borderBottomWidth: dimensions.borderWidth,
    borderBottomColor: colors.border,
  },
  cell: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    paddingBlock: dimensions.space2,
    paddingInline: dimensions.space3,
    color: colors.textStrong,
    whiteSpace: 'nowrap',
  },
  header: {
    color: colors.textSoft,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
  },
  code: { fontFamily: MONO_FAMILY, fontSize: dimensions.fontSizeXs },
});

const COLUMNS = ['Installation', 'Used', 'Attempts', 'Failures', 'Last failure'] as const;

export function FreeGrants({ stats }: { stats: GrantStats }) {
  const metrics: ReadonlyArray<readonly [string, string]> = [
    ['Provider starts today', `${stats.dailyProviderStarts}/${stats.dailyProviderStartLimit}`],
    ['Sampled successes', String(stats.sampledSuccessful)],
    ['Sampled attempts', String(stats.sampledAttempts)],
    ['Sampled failures', String(stats.sampledFailures)],
    ['Sampled active', String(stats.sampledActiveGrants)],
    ['Sampled exhausted', String(stats.sampledExhaustedGrants)],
    ['Sampled in flight', String(stats.sampledActiveReservations)],
  ];
  return (
    <AdminSection>
      <AdminRuleLabel count={`sample ${stats.sampledGrantCount}`}>
        Free generation grants
      </AdminRuleLabel>
      {stats.persistent ? null : (
        <AdminStatusMessage status="warning">
          Free grant monitoring is using local memory and will reset with this server instance.
        </AdminStatusMessage>
      )}
      {stats.grantSamplePartial ? (
        <AdminStatusMessage status="warning">
          Grant metrics and activity are sampled from the first {stats.grantSampleLimit} records.
          Today&apos;s provider-start count is complete.
        </AdminStatusMessage>
      ) : null}
      <html.div role="list" aria-label="Free generation grant figures" style={styles.metrics}>
        {metrics.map(([label, value]) => (
          <html.div key={label} role="listitem" style={styles.metric}>
            <html.span style={styles.label}>{label}</html.span>
            <html.span style={styles.value}>{value}</html.span>
          </html.div>
        ))}
      </html.div>
      {stats.recent.length > 0 ? (
        <html.div style={styles.tableWrap}>
          <html.div role="table" aria-label="Recent free generation grants" style={styles.table}>
            <html.div role="rowgroup">
              <html.div role="row" style={styles.row}>
                {COLUMNS.map((column) => (
                  <html.span key={column} role="columnheader" style={[styles.cell, styles.header]}>
                    {column}
                  </html.span>
                ))}
              </html.div>
            </html.div>
            <html.div role="rowgroup">
              {stats.recent.map((grant) => (
                <html.div key={grant.installation} role="row" style={styles.row}>
                  <html.span role="cell" style={styles.cell}>
                    <html.code style={styles.code}>{grant.installation}…</html.code>
                  </html.span>
                  <html.span role="cell" style={styles.cell}>
                    {grant.successful}/{FREE_GENERATION_LIMIT}
                  </html.span>
                  <html.span role="cell" style={styles.cell}>
                    {grant.attempts}
                  </html.span>
                  <html.span role="cell" style={styles.cell}>
                    {grant.failures}
                  </html.span>
                  <html.span role="cell" style={styles.cell}>
                    {grant.lastFailureKind ?? '—'}
                  </html.span>
                </html.div>
              ))}
            </html.div>
          </html.div>
        </html.div>
      ) : null}
    </AdminSection>
  );
}
