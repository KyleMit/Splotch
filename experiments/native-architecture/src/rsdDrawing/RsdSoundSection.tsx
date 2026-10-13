import { css, html } from 'react-strict-dom';
import { SOUND_VOLUME_DEFAULT, SOUND_VOLUME_MAX, SOUND_VOLUME_MIN } from '../settings/soundVolume';
import { RsdRuleLabel } from './RsdRuleLabel';
import { RsdSettingCard } from './RsdSettingCard';
import { RsdSliderRow } from './RsdSlider';
import { RsdToggleRow } from './RsdToggleRow';
import { dimensions } from './tokens.css';
import type { SliderDraft } from './useSliderDraft';

// SoundSection.svelte's spacing around the Volume row and above "What makes sound";
// native-settings-sections.test.mjs reads each from that source.
export const SOUND_SECTION_SPACING = {
  sliderTop: 12,
  sliderBottom: 2,
  sourcesTop: 20,
  sourcesHeadingBottom: 10,
} as const;

const styles = css.create({
  group: { display: 'flex', flexDirection: 'column' },
  slider: {
    marginTop: SOUND_SECTION_SPACING.sliderTop,
    marginBottom: SOUND_SECTION_SPACING.sliderBottom,
  },
  sources: { marginTop: SOUND_SECTION_SPACING.sourcesTop },
  heading: { marginBottom: SOUND_SECTION_SPACING.sourcesHeadingBottom },
  rows: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
});

type SoundSectionProps = {
  soundEnabled: boolean;
  volume: SliderDraft;
  drawingSoundEnabled: boolean;
  deleteSoundEnabled: boolean;
  busy: boolean;
  onToggle: () => void;
  onDrawingSoundChange: (enabled: boolean) => void;
  onDeleteSoundChange: (enabled: boolean) => void;
};

// The shipping SoundSection.svelte: the Sound switch with its Volume slider, then which sources
// make sound. Volume and the sources show only while sound is on.
export function RsdSoundSection(props: SoundSectionProps) {
  const { soundEnabled, volume, busy } = props;
  return (
    <html.section style={styles.group}>
      <RsdSettingCard>
        <RsdToggleRow
          icon={soundEnabled ? 'volume-on' : 'volume-off'}
          label="Sound"
          id="soundToggle"
          checked={soundEnabled}
          disabled={busy}
          onToggle={(next) => {
            if (next !== soundEnabled) props.onToggle();
          }}
        />
        {soundEnabled ? (
          <html.div style={styles.slider}>
            <RsdSliderRow
              id="soundVolumeLabel"
              label="Volume"
              value={volume.value}
              min={SOUND_VOLUME_MIN}
              max={SOUND_VOLUME_MAX}
              snap={SOUND_VOLUME_DEFAULT}
              onInput={volume.onInput}
              onActiveChange={volume.onActiveChange}
            />
          </html.div>
        ) : null}
      </RsdSettingCard>
      {soundEnabled ? (
        <html.div style={styles.sources}>
          <html.div style={styles.heading}>
            <RsdRuleLabel as="h4" strong>
              What makes sound
            </RsdRuleLabel>
          </html.div>
          <html.div style={styles.rows}>
            <RsdSettingCard>
              <RsdToggleRow
                icon="brush-pen"
                label="Drawing"
                id="drawingSoundToggle"
                checked={props.drawingSoundEnabled}
                disabled={busy}
                onToggle={props.onDrawingSoundChange}
              />
            </RsdSettingCard>
            <RsdSettingCard>
              <RsdToggleRow
                icon="trash-closed"
                label="Deleting"
                id="deleteSoundToggle"
                checked={props.deleteSoundEnabled}
                disabled={busy}
                onToggle={props.onDeleteSoundChange}
              />
            </RsdSettingCard>
          </html.div>
        </html.div>
      ) : null}
    </html.section>
  );
}
