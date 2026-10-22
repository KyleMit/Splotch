import { useState } from 'react';
import { css, html } from 'react-strict-dom';
import { RsdSettingCard, RsdSettingGroup } from '../../rsdDrawing/RsdSettingCard';
import { RsdSliderRow } from '../../rsdDrawing/RsdSlider';
import { RsdToggleRow } from '../../rsdDrawing/RsdToggleRow';
import { dimensions } from '../../rsdDrawing/tokens.css';
import { Code, Section } from './Section';
import { specimen } from './designStyles';

const SLIDER_DEFAULT_PERCENT = 60;
const SLIDER_SNAP_PERCENT = 50;
const CHROME_CARD_MIN_PX = 240;
const FURNITURE_MAX_PX = 420;

// The named, single-instance chrome and the component that draws each, so a surface is found and
// reused rather than recreated. The canonical glossary is the architecture skill's.
const NAMED_CHROME = [
  {
    group: 'Canvas chrome',
    items: [
      [
        'Drawing Canvas',
        'RsdDrawingScreen.tsx · drawing/InkScene.tsx',
        'The full-screen paper drawing surface.',
      ],
      [
        'Color Palette',
        'RsdColorButton.tsx',
        'The swatch bar: left edge in landscape, top in portrait; trims swatches by priority as space shrinks.',
      ],
      [
        'Gradient Swatch',
        'RsdColorPicker.tsx',
        'The last swatch, a honeycomb of palette hexagons that opens the hex color picker.',
      ],
      [
        'Actions Panel',
        'RsdActionsPanel.tsx',
        'The bottom-corner drawer of chunky floating action buttons.',
      ],
      [
        'Brush Menu / Stroke Width Menu',
        'RsdToolFlyouts.tsx · RsdFlyoutMenu.tsx',
        'The two tool flyouts on the shared flyout menu.',
      ],
      [
        'Clear Button',
        'RsdClearControl.tsx',
        'The red drag-to-clear trash control, painted from fixedColors.clearGradientRest, as is its coachmark ghost.',
      ],
      [
        'Settings Button / Fullscreen Toggle',
        'RsdEdgeControls.tsx · RsdFullscreenToggle.tsx',
        'The muted canvas-corner controls.',
      ],
      [
        'Notch Band',
        'RsdNotchBand.tsx',
        'The strip filling the top safe-area inset so the camera notch sits on chrome, not paper.',
      ],
      [
        'Install Banner',
        'RsdInstallBanner.tsx',
        'The bottom-center pill inviting a grown-up to add Splotch to the home screen.',
      ],
      [
        'Save Failure Banner',
        'RsdFailureBanner.tsx',
        'The notice telling the grown-up a picture was not saved, with Try again.',
      ],
      [
        'Pointer Halos',
        'drawing/PointerHalos.tsx',
        'Touch-feedback rings under fingers while drawing.',
      ],
      ['AI Dial', 'ai/AiProgressDial.tsx', 'The generation-progress dial.'],
      [
        'Polaroid flight',
        'RsdPolaroidFlight.tsx',
        'The save-screenshot flight: flash, frame and glide, on fixedColors.polaroidPaper.',
      ],
    ],
  },
  {
    group: 'Page chrome',
    items: [
      [
        'Page sheet',
        'RsdNotFoundPage.tsx (RsdPageSheet) · RsdPageHero.tsx',
        'The standalone-page chrome: ground, centered sheet, crayon-strip masthead, wordmark and hero, worn by every information page.',
      ],
      [
        'Settings shells',
        'RsdSettingsCompact.tsx · RsdSettingsWide.tsx',
        'One section list, two responsive shells: drill-in on compact screens, sidebar when wide.',
      ],
      [
        'Contents',
        'RsdPageContents.tsx · RsdSidebarRow.tsx',
        'The guide-rail table of contents the wide Settings sidebar, /privacy and /changelog wear.',
      ],
      ['Error Screen', 'RsdErrorScreen.tsx', 'The crash boundary’s friendly restart surface.'],
    ],
  },
] as const;

const styles = css.create({
  furniture: { maxWidth: FURNITURE_MAX_PX },
  chrome: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${CHROME_CARD_MIN_PX}px, 1fr))`,
    gap: dimensions.space3,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
});

function FurnitureSection() {
  const [sound, setSound] = useState(true);
  const [reduce, setReduce] = useState(false);
  const [volume, setVolume] = useState(SLIDER_DEFAULT_PERCENT);
  return (
    <Section
      id="furniture"
      intro="The shared rows every Settings section is built from: pure props, themed end to end, icons from the app set. The slider drags relatively (grab anywhere, slide the value) and the tick marks the snap detent where a row defines one. Live below."
    >
      <html.div style={styles.furniture}>
        <RsdSettingCard>
          <RsdSettingGroup>
            <RsdToggleRow
              id="design-toggle"
              icon="volume-on"
              label="Toggle row"
              help="Optional help describes the setting."
              checked={sound}
              onToggle={setSound}
            />
            <RsdToggleRow
              id="design-toggle-color"
              icon="sound"
              label="Toggle row with a color icon"
              checked={reduce}
              onToggle={setReduce}
            />
            <RsdSliderRow
              id="design-slider"
              icon="volume-on"
              label="Slider row"
              value={volume}
              snap={SLIDER_SNAP_PERCENT}
              onInput={setVolume}
            />
          </RsdSettingGroup>
        </RsdSettingCard>
      </html.div>
      <html.p style={specimen.intro}>
        A control with a selected state is a picker, not a button: the theme picker, the orientation
        segment and the controls chips all render through <Code>RsdSegmentedPicker</Code>.
      </html.p>
    </Section>
  );
}

function NamedChromeSection() {
  return (
    <Section
      id="named"
      intro="Bespoke, single-instance chrome, named so it's found rather than recreated. The running app is its documentation; the canonical glossary is the architecture skill's."
    >
      {NAMED_CHROME.map(({ group, items }) => (
        <html.div key={group} style={specimen.stack}>
          <html.h4 style={specimen.subheading}>{group}</html.h4>
          <html.ul style={styles.chrome}>
            {items.map(([name, file, note]) => (
              <html.li key={name} style={specimen.card}>
                <html.span style={specimen.strong}>{name}</html.span>
                <Code>{file}</Code>
                <html.span style={specimen.meta}>{note}</html.span>
              </html.li>
            ))}
          </html.ul>
        </html.div>
      ))}
    </Section>
  );
}

export function ComponentSections() {
  return (
    <>
      <FurnitureSection />
      <NamedChromeSection />
    </>
  );
}
