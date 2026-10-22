import { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { useLibraryControls, type LibraryContext } from '../offlineLibrary/LibraryScope';
import { COLORING_SECTION_COPY, coloringStorageLines } from '../settings/coloringSection';
import { RsdButton } from './RsdButton';
import { RsdIcon } from './RsdIcon';
import { RsdSettingCard, RsdSettingGroup, RsdSettingSectionBody } from './RsdSettingCard';
import { RsdToggleRow, SETTING_ICON_PX } from './RsdToggleRow';
import { colors, dimensions, fonts } from './tokens.css';

// ColoringSection.svelte's status line height; rsd-native-coloring-picker.test.mjs reads it.
const STATUS_LINE_HEIGHT = 1.4;

// Every download policy change reapplies the policy, as shipping's policy event does: it lifts a
// removal's pause and clears a failure or network wait, so turning Coloring book on or changing
// the mobile data choice starts downloads again.
function resumeDownloads(library: LibraryContext | null, allowMetered: boolean) {
  if (library) void library.owner.setPolicy(true, allowMetered);
}

// The shipping Settings › Coloring section (settings/ColoringSection.svelte): the Coloring book
// switch, the mobile data switch, and the Downloaded pictures storage card. Downloads pause and
// retry on their own; the section only reports what is on the device.
export function RsdColoringSection({
  enabled,
  busy,
  onColoringBookChange,
}: {
  enabled: boolean;
  busy: boolean;
  onColoringBookChange: (enabled: boolean) => void;
}) {
  const library = useLibraryControls();
  const [removing, setRemoving] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const state = library?.state ?? null;
  const allowMetered = state?.allowMetered ?? false;
  const nothingToRemove = state !== null && state.inventoried && state.installed.length === 0;
  async function remove() {
    if (!library) return;
    setRemoving(true);
    setRemoveFailed(false);
    await library.remove();
    setRemoveFailed(library.owner.snapshot().status === 'failed');
    setRemoving(false);
  }
  return (
    <RsdSettingSectionBody>
      <RsdSettingGroup>
        <RsdSettingCard>
          <RsdToggleRow
            icon="shapes"
            label={COLORING_SECTION_COPY.coloringBook}
            id="coloringBookToggle"
            checked={enabled}
            disabled={busy}
            help={COLORING_SECTION_COPY.coloringBookHelp}
            onToggle={(next) => {
              onColoringBookChange(next);
              if (next) resumeDownloads(library, allowMetered);
            }}
          />
        </RsdSettingCard>
        <RsdSettingCard>
          <RsdToggleRow
            icon="download"
            label={COLORING_SECTION_COPY.metered}
            id="coloringPacksMeteredToggle"
            checked={allowMetered}
            disabled={busy || !enabled || !library}
            help={COLORING_SECTION_COPY.meteredHelp}
            onToggle={(next) => resumeDownloads(library, next)}
          />
        </RsdSettingCard>
        <RsdSettingCard>
          <html.div style={styles.storage}>
            <html.div style={styles.summary}>
              <RsdIcon name="picture-stack" size={SETTING_ICON_PX} ink={undefined} muted={false} />
              <html.div style={styles.copy}>
                <html.span style={styles.title}>{COLORING_SECTION_COPY.storage}</html.span>
                {state
                  ? coloringStorageLines(state, enabled).map((line) => (
                      <html.p key={line} style={styles.line}>
                        {line}
                      </html.p>
                    ))
                  : null}
              </html.div>
            </html.div>
            <html.div style={styles.action}>
              <RsdButton
                variant="danger"
                size="sm"
                disabled={!library || removing || nothingToRemove}
                onPress={() => void remove()}
              >
                {removing ? COLORING_SECTION_COPY.removing : COLORING_SECTION_COPY.remove}
              </RsdButton>
            </html.div>
            {removeFailed ? (
              <html.p style={[styles.line, styles.failed]}>
                {COLORING_SECTION_COPY.removeFailed}
              </html.p>
            ) : null}
          </html.div>
        </RsdSettingCard>
      </RsdSettingGroup>
    </RsdSettingSectionBody>
  );
}

const styles = css.create({
  storage: { display: 'flex', flexDirection: 'column', gap: dimensions.space4 },
  summary: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dimensions.settingIconGap,
  },
  copy: { display: 'flex', flexDirection: 'column', flexShrink: 1, minWidth: 0 },
  title: {
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  line: {
    marginTop: dimensions.space1,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeSm,
    lineHeight: STATUS_LINE_HEIGHT,
  },
  failed: { color: colors.dangerText },
  action: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start' },
});
