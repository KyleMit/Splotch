import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { DRAWING_SCALE } from '../drawing/theme';
import type { BrushPreferencesState } from '../settings/brushPreferences';
import type { SoundSettingsState } from '../settings/soundSettingsCodec';
import { sectionSubtitle, type NativeSettingsSectionId } from '../settings/sections';
import { whatsNewUnseen } from '../settings/whatsNew';

// The shipping hub row's activity dot.
const ACTIVITY_DOT_PX = 8;

const styles = css.create({
  list: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  item: { display: 'flex', flexDirection: 'column' },
  row: {
    boxSizing: 'border-box',
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
    minHeight: dimensions.touchTarget,
    padding: dimensions.space4,
    borderWidth: 0,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.surface2,
    textAlign: 'left',
  },
  text: { display: 'flex', flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 2 },
  title: {
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
    fontWeight: dimensions.fontWeightBold,
  },
  subtitle: (fontSize: number) => ({ color: colors.text, fontSize }),
  dot: (size: number, radius: number) => ({
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor: colors.brandSolid,
  }),
});

function sectionUnseen(id: NativeSettingsSectionId, settings: SoundSettingsState) {
  return id === 'whatsnew' && whatsNewUnseen(settings.whatsNewSeen);
}

// The shipping phone hub (HubList.svelte): one row per section with its live status, and the
// activity dot on a section whose content changed since the parent last opened it.
export function RsdSettingsHub({
  sections,
  settings,
  brushState,
  onOpen,
}: {
  sections: readonly { id: NativeSettingsSectionId; label: string }[];
  settings: SoundSettingsState;
  brushState: BrushPreferencesState;
  onOpen: (id: NativeSettingsSectionId) => void;
}) {
  return (
    <html.div role="list" style={styles.list}>
      {sections.map(({ id, label }) => {
        const unseen = sectionUnseen(id, settings);
        return (
          <html.div key={id} role="listitem" style={styles.item}>
            <html.button
              aria-label={unseen ? `${label}, new` : label}
              style={styles.row}
              onClick={() => onOpen(id)}
            >
              <html.span style={styles.text}>
                <html.span style={styles.title}>{label}</html.span>
                <html.span style={styles.subtitle(DRAWING_SCALE.fontSizeSm)}>
                  {sectionSubtitle(id, settings, brushState)}
                </html.span>
              </html.span>
              {unseen ? (
                <html.span
                  aria-hidden
                  data-testid="settings-activity-dot"
                  style={styles.dot(ACTIVITY_DOT_PX, ACTIVITY_DOT_PX / 2)}
                />
              ) : null}
            </html.button>
          </html.div>
        );
      })}
    </html.div>
  );
}
