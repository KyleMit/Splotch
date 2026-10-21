import { useState, type ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { RsdButton } from '../../rsdDrawing/RsdButton';
import { RsdSidebarRow } from '../../rsdDrawing/RsdSidebarRow';
import { RsdStepNumber } from '../../rsdDrawing/RsdStepNumberContent';
import { RsdTextField } from '../../rsdDrawing/RsdTextField';
import { colors, dimensions, fonts } from '../../rsdDrawing/tokens.css';
import { Code, Section } from './Section';
import { specimen } from './designStyles';

const STEPS = [
  { label: 'Install as App', hue: 'Blue' },
  { label: 'Set up playtime', hue: 'Green' },
  { label: 'Start drawing', hue: 'Orange' },
] as const;

const SIDEBAR_SPECIMEN_PX = 240;
const TOC_ROWS = [
  { id: 'color', label: 'Color', icon: 'appearance' },
  { id: 'type', label: 'Type scale', icon: 'controls' },
  { id: 'motion', label: 'Motion', icon: 'wand-stars' },
] as const;

const styles = css.create({
  recipes: { display: 'flex', flexDirection: 'column', gap: dimensions.space6 },
  recipe: { display: 'flex', flexDirection: 'column', gap: dimensions.space3 },
  steps: { display: 'flex', flexDirection: 'column', gap: dimensions.space3 },
  step: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: dimensions.space3 },
  cardTitle: {
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  body: { margin: 0, color: colors.text, fontSize: dimensions.fontSizeMd },
  field: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  fieldLabel: {
    color: colors.textStrong,
    fontSize: dimensions.fontSizeSm,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  callout: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space1,
    padding: dimensions.space4,
    backgroundColor: colors.brandWash,
    borderRadius: dimensions.radiusLg,
  },
  toc: { display: 'flex', flexDirection: 'column', maxWidth: SIDEBAR_SPECIMEN_PX },
  focusRow: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: dimensions.space3 },
});

const ignore = () => {};

function Recipe({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <html.div style={styles.recipe}>
      <html.h4 style={specimen.subheading}>{title}</html.h4>
      {children}
      <html.p style={specimen.meta}>{note}</html.p>
    </html.div>
  );
}

export function RecipeSection() {
  const [code, setCode] = useState('');
  const [active, setActive] = useState<(typeof TOC_ROWS)[number]['id']>('color');
  return (
    <Section
      id="recipes"
      intro="The defaults, composed: how a handful of tokens and components assemble into the surfaces the app builds. Start from one of these before inventing a new arrangement; if a recipe and a rule disagree, the token's usage rule wins."
    >
      <html.div style={styles.recipes}>
        <Recipe
          title="Numbered steps"
          note="RsdStepNumber mixes a crayon hue into the surface for the disc and into colors.textStrong for the digit, through stepNumberMix: a crayon tint on light sheets, full heading ink over a lifted disc at night."
        >
          <html.div style={[specimen.stage, styles.steps]}>
            {STEPS.map(({ label, hue }, index) => (
              <html.div key={label} style={styles.step}>
                <RsdStepNumber number={index + 1} size="regular" shape="disc" hue={hue} />
                <html.span style={specimen.strong}>{label}</html.span>
              </html.div>
            ))}
          </html.div>
        </Recipe>
        <Recipe
          title="Card"
          note="colors.surface · colors.border hairline · dimensions.radiusLg · dimensions.space4 padding · colors.textStrong heading over colors.text body and colors.textSoft meta."
        >
          <html.div style={specimen.card}>
            <html.h5 style={styles.cardTitle}>Coloring Book</html.h5>
            <html.p style={styles.body}>
              Line-art pages for the crayons to color in. Open one up and let them scribble.
            </html.p>
            <html.span style={specimen.meta}>Two books · updated with each release</html.span>
          </html.div>
        </Recipe>
        <Recipe
          title="Form row"
          note="dimensions.fontSizeSm medium label · RsdTextField on colors.surface with a colors.border hairline, typing in colors.textStrong over a colors.textSoft placeholder · dimensions.fontSizeXs colors.textSoft help."
        >
          <html.div style={[specimen.card, styles.field]}>
            <html.label for="design-access-code" style={styles.fieldLabel}>
              Access code
            </html.label>
            <RsdTextField
              id="design-access-code"
              value={code}
              onChangeText={setCode}
              placeholder="Enter your code"
              autoComplete="off"
            />
            <html.span style={specimen.meta}>Saved on this device. Forget it any time.</html.span>
          </html.div>
        </Recipe>
        <Recipe
          title="Callout"
          note="colors.brandWash fill · dimensions.radiusLg · dimensions.space4 padding · colors.textStrong lead, colors.text body. For a form's submit result, use RsdStatusMessage instead."
        >
          <html.div style={styles.callout}>
            <html.span style={specimen.strong}>Not sure? Start here</html.span>
            <html.span style={styles.body}>
              A brand-tinted aside that guides without shouting: the wash flips with the theme and
              the ink stays readable on it.
            </html.span>
          </html.div>
        </Recipe>
        <Recipe
          title="CTA block"
          note="A card composed with RsdButton's brand variant: dimensions.fontSizeLg lede · dimensions.space3 between body and action."
        >
          <html.div style={specimen.card}>
            <html.h5 style={styles.cardTitle}>Ready when they are</html.h5>
            <html.p style={styles.body}>
              Open it up, hand over the device, and let them make a mess. That&apos;s the whole
              idea.
            </html.p>
            <html.div style={specimen.row}>
              <RsdButton variant="brand" onPress={ignore}>
                Start drawing
              </RsdButton>
            </html.div>
          </html.div>
        </Recipe>
        <Recipe
          title="Sidebar row"
          note="The wide Settings sidebar's row, live: pick one. The active row takes the brand wash and brand text; each row leads with its section icon."
        >
          <html.div style={[specimen.stage, styles.toc]}>
            {TOC_ROWS.map((row) => (
              <RsdSidebarRow
                key={row.id}
                icon={row.icon}
                unseen={false}
                label={row.label}
                active={active === row.id}
                onSelect={() => setActive(row.id)}
              />
            ))}
          </html.div>
        </Recipe>
        <Recipe
          title="Focus"
          note="Every interactive element takes the global brand outline from strict.css, 2px wide at a 2px offset; a control whose ring is not its own box marks where it goes with data-focus-ring. Never remove an outline without a replacement ring."
        >
          <html.div style={styles.focusRow}>
            <RsdButton variant="brand" onPress={ignore}>
              Brand action
            </RsdButton>
            <RsdButton variant="wash" onPress={ignore}>
              Wash action
            </RsdButton>
            <RsdButton variant="outline" onPress={ignore}>
              Copy link
            </RsdButton>
          </html.div>
          <html.p style={specimen.meta}>
            Tab here to see focus. <Code>dimensions.focusRingWidth</Code> ·{' '}
            <Code>dimensions.focusRingOffset</Code>
          </html.p>
        </Recipe>
      </html.div>
    </Section>
  );
}
