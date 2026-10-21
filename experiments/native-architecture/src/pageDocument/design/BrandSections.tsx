import { css, html } from 'react-strict-dom';
import { RsdBrandMark } from '../../rsdDrawing/RsdNotFoundPage';
import { RsdIcon } from '../../rsdDrawing/RsdIcon';
import { RsdSplotchyIcon } from '../../rsdDrawing/RsdSplotchyIcon';
import type { NativeIconName } from '../../rsdDrawing/icons.generated';
import { brandColors, colors, dimensions, fonts } from '../../rsdDrawing/tokens.css';
import { Code, Section } from './Section';
import { specimen } from './designStyles';

const MASCOT_PX = 96;
const DOTTIE_PX = 72;
const QUOTE_RULE_PX = 3;

const VOICES = [
  {
    label: 'Kid-adjacent: playful & warm',
    lines: [
      "Open it up, hand over the device, and let them make a mess. That's the whole idea.",
      'A blank page and a box of crayons: no ads, no accounts, nothing to buy.',
    ],
  },
  {
    label: 'Parent-facing: plain & direct',
    lines: [
      'Your key is stored only on your device. We never keep a copy.',
      'Splotch collects nothing in the background. No ads. No tracking. No analytics.',
    ],
  },
] as const;

const DOTTIE = [
  {
    label: 'Everyday expressions',
    faces: [
      ['Sunny', 'dottie-sunny'],
      ['Kind eyes', 'dottie-kind-eyes'],
      ['Little lean', 'dottie-lean'],
      ['Giggle', 'dottie-giggle'],
      ['Bright', 'dottie-bright'],
    ],
  },
  {
    label: 'Error expressions',
    faces: [
      ['A little stumped', 'dottie-stumped'],
      ['Oh, a hiccup', 'dottie-hiccup'],
      ['A small question', 'dottie-question'],
      ['One more go', 'dottie-retry'],
      ['Another idea', 'dottie-another-idea'],
    ],
  },
] as const satisfies readonly {
  label: string;
  faces: readonly (readonly [string, NativeIconName])[];
}[];

const styles = css.create({
  voices: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: dimensions.space4,
  },
  quote: {
    margin: 0,
    paddingLeft: dimensions.space3,
    borderLeftWidth: QUOTE_RULE_PX,
    borderLeftStyle: 'solid',
    borderLeftColor: brandColors.brand,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
  },
  marks: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: dimensions.space7,
  },
  mark: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: dimensions.space2 },
  faces: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: dimensions.space3,
  },
  face: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: dimensions.space1,
    padding: dimensions.space3,
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    textAlign: 'center',
  },
  faceName: { fontFamily: fonts.semiboldFamily, fontWeight: fonts.semiboldWeight },
});

const goHome = () => location.assign('/');

function VoiceSection() {
  return (
    <Section
      id="voice"
      intro="Two voices, one maker. Kid-adjacent copy is playful and warm; parent-facing copy (Settings, store listings, privacy) is plain and direct. Sentence case everywhere: Title Case only for proper feature names (Night Mode, Guided Access). “You” is the parent, “they” is the child, “we” makes the maker's promises. No emoji in UI chrome. Feature bullets lead with verbs, and copy is honest about why a tradeoff exists."
    >
      <html.div style={styles.voices}>
        {VOICES.map(({ label, lines }) => (
          <html.div key={label} style={specimen.card}>
            <html.span style={specimen.label}>{label}</html.span>
            {lines.map((line) => (
              <html.blockquote key={line} style={styles.quote}>
                {line}
              </html.blockquote>
            ))}
          </html.div>
        ))}
      </html.div>
    </Section>
  );
}

function MascotSection() {
  return (
    <Section
      id="mascot"
      intro="Splotchy, a rainbow-crayoned splotch, is the mascot and the app icon. There is no drawn logo: parent pages sign themselves with the brand mark, the crayon strip (seven pills in rainbow order, hues from the drawing palette) beside a small-caps wordmark, while page titles are plain Quicksand headings."
    >
      <html.div style={styles.marks}>
        <html.div style={styles.mark}>
          <RsdSplotchyIcon size={MASCOT_PX} />
          <Code>RsdSplotchyIcon</Code>
        </html.div>
        <html.div style={styles.mark}>
          <RsdBrandMark phone={false} narrow={false} onDrawingReturn={goHome} />
          <Code>RsdBrandMark, as the page sheet wears it</Code>
        </html.div>
      </html.div>
    </Section>
  );
}

function DottieSection() {
  return (
    <Section
      id="dottie"
      intro="Dottie is Splotch's little purple companion: joyful, friendly and warm. Her soft, uneven silhouette stays the same across expressions, with flat color and a few rounded lines giving her personality. She keeps her purple body and dark features in both themes."
    >
      {DOTTIE.map(({ label, faces }) => (
        <html.div key={label} style={specimen.stack}>
          <html.h4 style={specimen.subheading}>{label}</html.h4>
          <html.div style={styles.faces}>
            {faces.map(([name, icon]) => (
              <html.div key={icon} style={styles.face}>
                <RsdIcon name={icon} size={DOTTIE_PX} ink={undefined} muted={false} />
                <html.span style={styles.faceName}>{name}</html.span>
                <html.span style={specimen.meta}>{icon}</html.span>
              </html.div>
            ))}
          </html.div>
        </html.div>
      ))}
    </Section>
  );
}

export function BrandSections() {
  return (
    <>
      <VoiceSection />
      <MascotSection />
      <DottieSection />
    </>
  );
}
