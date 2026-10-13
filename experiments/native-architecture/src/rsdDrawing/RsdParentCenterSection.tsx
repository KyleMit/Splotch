import { useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { PARENT_PLATFORM } from '../platform/parentPlatform';
import { css, html } from 'react-strict-dom';
import { ModalShell } from './ModalShell';
import { RsdButton } from './RsdButton';
import { RsdConfirmCard } from './RsdConfirmCard';
import { RsdSegmentedPicker } from './RsdSegmentedPicker';
import { RsdSettingCard, RsdSettingGroup } from './RsdSettingCard';
import { RsdStatusMessage } from './RsdStatusMessage';
import { RsdToggleRow } from './RsdToggleRow';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { useModalPresence } from './useModalPresence';
import { styles as controlStyles } from './controls';
import { colors, dimensions, fonts } from './tokens.css';
import {
  PARENT_FEATURES,
  PARENT_MODES,
  endsParentCenterProtection,
  isParentModeAvailable,
  type ParentFeature,
  type ParentMode,
} from '../parentCenter/parentPolicy';
import {
  POLICY_COPY_MIN_PX,
  POLICY_MATRIX_MIN_WIDTH_PX,
  POLICY_MODES_COLUMN_PX,
} from '../parentCenter/parentCenterMetrics';
import {
  PARENT_CENTER_AI_COPY,
  PARENT_CENTER_COPY,
  PARENT_HELP,
  PARENT_LABELS,
  PARENT_MODE_LABELS,
} from '../parentCenter/parentCenterCopy';
import type { DrawingProductOwner } from '../product/createDrawingProduct';
import type { SoundSettingsState } from '../settings/soundSettings';

// Before the list has measured itself, a window this wide is a tablet's Settings, which always
// holds the matrix.
const MATRIX_WINDOW_GUESS_PX = 600;
const COPY_LINE_HEIGHT = 1.5;
const HELP_LINE_HEIGHT = 1.4;
// The heading's 0.03em tracking at its --font-size-xs.
const HEADER_LETTER_SPACING_PX = 0.36;
const MODE_HEADING_LINE_HEIGHT = 1.25;

// The shipping Settings › Parent Center section: when Splotch asks for a grown-up check, one card
// per protected action. Wide enough, the cards line up as a matrix under one heading per mode.
export function RsdParentCenterSection({ owner }: { owner: DrawingProductOwner }) {
  const state = owner.getState();
  const settings = state.settings;
  const matrix = useMatrixLayout();
  if (!settings) return null;
  const disabled = !owner.settings.canEditParent();
  const choose = (feature: ParentFeature, mode: ParentMode) => {
    void owner.setPolicy(feature, mode);
  };
  return (
    <>
      <html.section style={styles.section}>
        <html.p style={[styles.soft, styles.intro]}>{PARENT_CENTER_COPY.intro}</html.p>
        <View onLayout={matrix.measure}>
          <html.div style={styles.list}>
            {matrix.on ? <MatrixHeader /> : null}
            {PARENT_FEATURES.map((feature) => (
              <PolicyCard
                key={feature}
                feature={feature}
                selected={settings.parentPolicies[feature]}
                matrix={matrix.on}
                disabled={disabled}
                onChoose={choose}
              />
            ))}
          </html.div>
        </View>
        <ModeNotes />
        <AiSwitch owner={owner} settings={settings} disabled={disabled} />
        <SaveStatus owner={owner} settings={settings} />
      </html.section>
      <UnprotectedConfirm owner={owner} open={state.confirmNever} />
    </>
  );
}

function useMatrixLayout() {
  const guess = useWindowDimensions().width >= MATRIX_WINDOW_GUESS_PX;
  const [measured, setMeasured] = useState<boolean | null>(null);
  return {
    on: measured ?? guess,
    measure: ({ nativeEvent }: LayoutChangeEvent) =>
      setMeasured(nativeEvent.layout.width >= POLICY_MATRIX_MIN_WIDTH_PX),
  };
}

// Names the three mode columns once. Decorative: every option keeps its own label as its name.
function MatrixHeader() {
  return (
    <html.div aria-hidden style={[styles.matrixRow, styles.header]}>
      <html.span style={[styles.headerText, styles.copyColumn(POLICY_COPY_MIN_PX)]}>
        {PARENT_CENTER_COPY.matrixHeading}
      </html.span>
      <html.div style={[styles.modesColumn(POLICY_MODES_COLUMN_PX), styles.headerModes]}>
        {PARENT_MODES.map((mode) => (
          <html.span key={mode} style={[styles.headerText, styles.headerMode]}>
            {PARENT_MODE_LABELS[mode]}
          </html.span>
        ))}
      </html.div>
    </html.div>
  );
}

function PolicyCard({
  feature,
  selected,
  matrix,
  disabled,
  onChoose,
}: {
  feature: ParentFeature;
  selected: ParentMode;
  matrix: boolean;
  disabled: boolean;
  onChoose: (feature: ParentFeature, mode: ParentMode) => void;
}) {
  const helpId = `parental-gate-${feature}-help`;
  const platform = PARENT_PLATFORM;
  const unavailable = !isParentModeAvailable(feature, 'never', platform);
  const unprotected = endsParentCenterProtection(feature, selected);
  const notes = [
    unavailable ? `parental-gate-${feature}-unavailable` : null,
    unprotected ? `parental-gate-${feature}-warning` : null,
  ].filter((id) => id !== null);
  const picker = (
    <RsdSegmentedPicker
      label={`${PARENT_LABELS[feature]} parental gate frequency`}
      describedBy={[helpId, ...notes].join(' ')}
      options={PARENT_MODES.map((mode) => ({
        value: mode,
        label: PARENT_MODE_LABELS[mode],
        disabled: disabled || !isParentModeAvailable(feature, mode, platform),
      }))}
      selected={selected}
      labels={matrix ? 'marks' : 'shown'}
      onSelect={(mode) => onChoose(feature, mode)}
    />
  );
  const copy = (
    <html.div
      style={[styles.copy, matrix ? styles.copyColumn(POLICY_COPY_MIN_PX) : styles.copyStacked]}
    >
      <html.h3 style={[controlStyles.semiboldText, styles.name]}>{PARENT_LABELS[feature]}</html.h3>
      <html.p id={helpId} style={styles.help}>
        {PARENT_HELP[feature]}
      </html.p>
    </html.div>
  );
  const body = (
    <>
      {matrix ? (
        <html.div style={styles.matrixRow}>
          {copy}
          <html.div style={styles.modesColumn(POLICY_MODES_COLUMN_PX)}>{picker}</html.div>
        </html.div>
      ) : (
        <>
          {copy}
          {picker}
        </>
      )}
      {unavailable ? (
        <PolicyNote
          id={`parental-gate-${feature}-unavailable`}
          tone="info"
          title={PARENT_CENTER_COPY.unavailableTitle}
          text={PARENT_CENTER_COPY.unavailable}
        />
      ) : null}
      {unprotected ? (
        <PolicyNote
          id={`parental-gate-${feature}-warning`}
          tone="warning"
          title={PARENT_CENTER_COPY.warningTitle}
          text={PARENT_CENTER_COPY.unprotected}
        />
      ) : null}
    </>
  );
  // A matrix tile carries roomier padding than a stacked card, so its copy lines up with the
  // column headings above it.
  return matrix ? (
    <html.article data-testid="setting-card" style={styles.matrixCard}>
      {body}
    </html.article>
  ) : (
    <RsdSettingCard>{body}</RsdSettingCard>
  );
}

// The note that explains an unavailable choice wears the brand wash; the one that reports a
// protection being off takes the danger wash.
function PolicyNote({
  id,
  tone,
  title,
  text,
}: {
  id: string;
  tone: 'info' | 'warning';
  title: string;
  text: string;
}) {
  return (
    <html.div
      id={id}
      role="note"
      style={[styles.note, tone === 'info' ? styles.info : styles.warning]}
    >
      <html.strong
        style={[controlStyles.semiboldText, styles.noteTitle, tone === 'info' && styles.infoTitle]}
      >
        {title}
      </html.strong>
      <html.span style={tone === 'info' ? styles.infoText : styles.warningText}>{text}</html.span>
    </html.div>
  );
}

// A footnote, not a control: no tinted panel, so the policy tiles stay the only filled surfaces.
function ModeNotes() {
  return (
    <html.div style={styles.notes}>
      <html.p style={styles.soft}>
        <html.strong style={[controlStyles.semiboldText, styles.strong]}>
          {PARENT_MODE_LABELS.session}
        </html.strong>{' '}
        {PARENT_CENTER_COPY.sessionNote}
      </html.p>
      <html.p style={styles.soft}>
        <html.strong style={[controlStyles.semiboldText, styles.strong]}>
          {PARENT_MODE_LABELS.never}
        </html.strong>{' '}
        {PARENT_CENTER_COPY.neverNote}
      </html.p>
    </html.div>
  );
}

function AiSwitch({
  owner,
  settings,
  disabled,
}: {
  owner: DrawingProductOwner;
  settings: SoundSettingsState;
  disabled: boolean;
}) {
  return (
    <html.div style={styles.aiGroup}>
      <RsdSettingGroup>
        <RsdSettingCard>
          <RsdToggleRow
            icon="wand-stars"
            label={PARENT_CENTER_AI_COPY.label}
            id="aiImageToggle"
            checked={settings.aiEnabled}
            disabled={disabled}
            help={
              settings.aiEnabled ? PARENT_CENTER_AI_COPY.help.on : PARENT_CENTER_AI_COPY.help.off
            }
            onToggle={(next) => {
              void owner.setAiEnabled(next);
            }}
          />
        </RsdSettingCard>
      </RsdSettingGroup>
    </html.div>
  );
}

// Native persistence is asynchronous where shipping's is not, so a failed save stays on screen with
// its retry; a save in flight or done is only announced.
function SaveStatus({
  owner,
  settings,
}: {
  owner: DrawingProductOwner;
  settings: SoundSettingsState;
}) {
  const failed = settings.status === 'ready' && !settings.saved;
  if (!failed) return <RsdVisuallyHidden live>{settings.message}</RsdVisuallyHidden>;
  return (
    <html.div style={styles.failure}>
      <RsdStatusMessage status="error">{settings.message}</RsdStatusMessage>
      <html.div style={styles.failureActions}>
        <RsdButton
          size="sm"
          onPress={() => {
            void owner.retryParentSave();
          }}
        >
          Retry saving Parent Center choices
        </RsdButton>
        <RsdButton
          size="sm"
          onPress={() => {
            void owner.settings.retryRead();
          }}
        >
          Read saved settings again
        </RsdButton>
      </html.div>
    </html.div>
  );
}

// Nothing persists until the parent confirms, so the picker keeps the prior policy behind the card
// and Keep it on leaves it exactly there.
function UnprotectedConfirm({ owner, open }: { owner: DrawingProductOwner; open: boolean }) {
  const presence = useModalPresence(open || null);
  if (!presence.shown) return null;
  return (
    <ModalShell
      visible={presence.visible}
      onDismiss={presence.dismissed}
      label={PARENT_CENTER_COPY.confirmTitle}
      size="confirm"
      onClose={owner.cancelNever}
      header={null}
    >
      <RsdConfirmCard
        title={PARENT_CENTER_COPY.confirmTitle}
        copy={PARENT_CENTER_COPY.unprotected}
        actions={[
          <RsdButton key="keep" size="lg" disabled={!presence.visible} onPress={owner.cancelNever}>
            {PARENT_CENTER_COPY.keepOn}
          </RsdButton>,
          <RsdButton
            key="off"
            variant="danger"
            size="lg"
            disabled={!presence.visible}
            onPress={() => {
              void owner.setPolicy('parentCenter', 'never', true);
            }}
          >
            {PARENT_CENTER_COPY.turnOff}
          </RsdButton>,
        ]}
      />
    </ModalShell>
  );
}

const styles = css.create({
  section: { display: 'flex', flexDirection: 'column' },
  soft: {
    margin: 0,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: COPY_LINE_HEIGHT,
  },
  intro: { marginBottom: dimensions.space6 },
  list: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: dimensions.space3 },
  matrixRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: dimensions.space6,
  },
  // The column widths come from parentCenterMetrics.ts, which the web style compile cannot read
  // inside a static style.
  copyColumn: (minWidth: number) => ({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth }),
  modesColumn: (width: number) => ({ flexShrink: 0, width }),
  header: { paddingInline: dimensions.space5 },
  headerText: {
    color: colors.text,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    letterSpacing: HEADER_LETTER_SPACING_PX,
    textTransform: 'uppercase',
  },
  // The same track geometry as the picker under it, so each heading sits over its option.
  headerModes: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space1,
    paddingInline: dimensions.space1,
  },
  headerMode: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    lineHeight: MODE_HEADING_LINE_HEIGHT,
    textAlign: 'center',
  },
  matrixCard: {
    display: 'flex',
    flexDirection: 'column',
    paddingBlock: dimensions.space4,
    paddingInline: dimensions.space5,
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface2,
  },
  copy: { minWidth: 0 },
  copyStacked: { marginBottom: dimensions.space3 },
  name: {
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
  },
  help: {
    margin: 0,
    marginTop: dimensions.space1,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: HELP_LINE_HEIGHT,
  },
  note: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: dimensions.space3,
    padding: dimensions.space3,
    borderRadius: dimensions.radiusMd,
    fontSize: dimensions.fontSizeSm,
    lineHeight: COPY_LINE_HEIGHT,
  },
  info: { backgroundColor: colors.brandWash },
  warning: { backgroundColor: colors.dangerWash },
  noteTitle: {
    color: colors.dangerText,
    fontSize: dimensions.fontSizeSm,
    lineHeight: COPY_LINE_HEIGHT,
  },
  infoTitle: { color: colors.textStrong },
  infoText: { color: colors.text, fontSize: dimensions.fontSizeSm, lineHeight: COPY_LINE_HEIGHT },
  warningText: {
    color: colors.dangerText,
    fontSize: dimensions.fontSizeSm,
    lineHeight: COPY_LINE_HEIGHT,
  },
  notes: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: dimensions.space5,
    gap: dimensions.space2,
    paddingInline: dimensions.space5,
  },
  strong: {
    color: colors.textStrong,
  },
  aiGroup: { marginTop: dimensions.space6 },
  failure: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    marginTop: dimensions.space4,
  },
  failureActions: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: dimensions.space2,
  },
});
