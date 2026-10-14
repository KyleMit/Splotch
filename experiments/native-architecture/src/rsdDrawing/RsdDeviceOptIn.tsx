import { css, html } from 'react-strict-dom';
import { DRAWING_ON_BRAND } from '../drawing/theme';
import { REPORT_FORM_COPY } from '../feedback/reportFormCopy';
import { styles as controlStyles } from './controls';
import { focusRingHost, focusRingPart } from './focusRing';
import { RsdDisclosure } from './RsdDisclosure';
import { RsdIcon } from './RsdIcon';
import { RsdPressable } from './RsdPressable';
import { colors, dimensions } from './tokens.css';

// ReportFields.svelte's device opt-in, shared by the feedback form and the AI problem report.
// Its literals stay local for the StyleX web compile; native-settings-info-drift.test.mjs reads
// each back from ReportFields.svelte.
const CHECK_GAP_PX = 10;
const CHECK_LINE_HEIGHT = 1.4;
const CHECKBOX_PX = 18;
const CHECKBOX_TOP_PX = 1;
const DEVICE_SUMMARY_PADDING_PX = { block: 8, inline: 12 } as const;
const DEVICE_LIST_PADDING_PX = { inline: 12, bottom: 4 } as const;
const DEVICE_LIST_LINE_HEIGHT = 1.7;
const DEVICE_NOTE_PADDING_PX = { top: 4, inline: 12, bottom: 10 } as const;
const DEVICE_NOTE_LINE_HEIGHT = 1.4;
const DEVICE_EMPTY_BOTTOM_PX = 8;
const CHECKBOX_TICK_PX = 14;
// The browser checkbox's own box: a hairline frame with slightly rounded corners, and a tick
// inset a little inside the brand fill once checked.
const CHECKBOX_RADIUS_PX = 3;

type DeviceRow = Readonly<{ label: string; value: string }>;

const styles = css.create({
  check: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: CHECK_GAP_PX,
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  // Square, unlike the box it holds: the browser rings shipping's checkbox square.
  boxFrame: { flexShrink: 0, marginTop: CHECKBOX_TOP_PX },
  box: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: CHECKBOX_PX,
    height: CHECKBOX_PX,
    borderRadius: CHECKBOX_RADIUS_PX,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.textSoft,
    backgroundColor: colors.surface,
  },
  boxChecked: { borderColor: colors.brandSolid, backgroundColor: colors.brandSolid },
  checkText: {
    flexShrink: 1,
    fontSize: dimensions.fontSizeSm,
    color: colors.text,
    lineHeight: CHECK_LINE_HEIGHT,
  },
  why: { color: colors.textSoft },
  details: { backgroundColor: colors.surface },
  detailsSummary: {
    paddingTop: DEVICE_SUMMARY_PADDING_PX.block,
    paddingBottom: DEVICE_SUMMARY_PADDING_PX.block,
    paddingLeft: DEVICE_SUMMARY_PADDING_PX.inline,
    paddingRight: DEVICE_SUMMARY_PADDING_PX.inline,
    fontSize: dimensions.fontSizeSm,
    color: colors.brandText,
  },
  detailsMark: { fontSize: dimensions.fontSizeSm },
  rows: {
    margin: 0,
    paddingTop: 0,
    paddingLeft: DEVICE_LIST_PADDING_PX.inline,
    paddingRight: DEVICE_LIST_PADDING_PX.inline,
    paddingBottom: DEVICE_LIST_PADDING_PX.bottom,
    listStyle: 'none',
  },
  row: {
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight: DEVICE_LIST_LINE_HEIGHT,
  },
  empty: {
    margin: 0,
    paddingTop: 0,
    paddingLeft: DEVICE_LIST_PADDING_PX.inline,
    paddingRight: DEVICE_LIST_PADDING_PX.inline,
    paddingBottom: DEVICE_EMPTY_BOTTOM_PX,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
  },
  note: {
    margin: 0,
    paddingTop: DEVICE_NOTE_PADDING_PX.top,
    paddingLeft: DEVICE_NOTE_PADDING_PX.inline,
    paddingRight: DEVICE_NOTE_PADDING_PX.inline,
    paddingBottom: DEVICE_NOTE_PADDING_PX.bottom,
    fontSize: dimensions.fontSizeXs,
    color: colors.textSoft,
    lineHeight: DEVICE_NOTE_LINE_HEIGHT,
  },
});

// The device opt-in, drawn as the browser draws shipping's checkbox in the brand accent: a real
// checkbox for assistive technology, the whole row its label.
export function DeviceCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <RsdPressable
      {...focusRingHost('part')}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${REPORT_FORM_COPY.includeDevice} ${REPORT_FORM_COPY.includeDeviceWhy}`}
      style={styles.check}
      onClick={onToggle}
    >
      <html.div {...focusRingPart('ring')} aria-hidden style={styles.boxFrame}>
        <html.div style={[styles.box, checked && styles.boxChecked]}>
          {checked ? (
            <RsdIcon name="check" size={CHECKBOX_TICK_PX} ink={DRAWING_ON_BRAND} muted={false} />
          ) : null}
        </html.div>
      </html.div>
      <html.span aria-hidden style={styles.checkText}>
        {`${REPORT_FORM_COPY.includeDevice} `}
        <html.span style={styles.why}>{REPORT_FORM_COPY.includeDeviceWhy}</html.span>
      </html.span>
    </RsdPressable>
  );
}

export function DeviceDetails({ rows }: { rows: readonly DeviceRow[] }) {
  return (
    <RsdDisclosure
      summary={
        <html.span style={controlStyles.semiboldText}>{REPORT_FORM_COPY.deviceSummary}</html.span>
      }
      style={styles.details}
      summaryStyle={styles.detailsSummary}
      markStyle={styles.detailsMark}
    >
      <html.div>
        {rows.length ? (
          <html.ul style={styles.rows}>
            {rows.map((row) => (
              <html.li key={row.label} style={styles.row}>
                <html.span style={controlStyles.semiboldText}>{`${row.label}:`}</html.span>
                {` ${row.value}`}
              </html.li>
            ))}
          </html.ul>
        ) : (
          <html.p style={styles.empty}>{REPORT_FORM_COPY.deviceGathering}</html.p>
        )}
        <html.p style={styles.note}>{REPORT_FORM_COPY.deviceNote}</html.p>
      </html.div>
    </RsdDisclosure>
  );
}
