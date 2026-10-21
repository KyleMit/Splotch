import { Fragment, useState } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../../drawing/DrawingAppearance';
import { DialogHeader } from '../../rsdDrawing/DialogHeader';
import { BUTTON_VARIANTS, RsdButton, type ButtonSize } from '../../rsdDrawing/RsdButton';
import { RsdDisclosure } from '../../rsdDrawing/RsdDisclosure';
import { RsdExternalMark } from '../../rsdDrawing/RsdExternalMark';
import { RsdRuleLabel } from '../../rsdDrawing/RsdRuleLabel';
import { RsdScrollCue } from '../../rsdDrawing/RsdScrollCue';
import { RsdSegmentedPicker } from '../../rsdDrawing/RsdSegmentedPicker';
import { RsdStatusMessage } from '../../rsdDrawing/RsdStatusMessage';
import { RsdVisuallyHidden } from '../../rsdDrawing/RsdVisuallyHidden';
import { colors, dimensions } from '../../rsdDrawing/tokens.css';
import { Code, Section } from './Section';
import { specimen } from './designStyles';

const SIZES: readonly { size: ButtonSize; note: string }[] = [
  { size: 'lg', note: 'a screen’s one decision' },
  { size: 'md', note: 'the default' },
  { size: 'sm', note: 'inline retry, dense rows' },
  { size: 'hero', note: 'kid-facing recovery' },
];

const SCROLL_CUE_FRAME_PX = 132;
const STATE_LABEL_PX = 72;
const SCROLL_CUE_INSET = { top: 12, right: 16, bottom: 12, left: 16 } as const;
const SCROLL_CUE_LINES = [
  'The cue is lit: there is more of this list below the fold.',
  'It is a reading of live scroll state, never decoration.',
  'The fade sits over the scroller and costs the content no height.',
  'Grow what is above it and it re-reads itself.',
  'Show a surface that was hidden and it re-arms.',
  'One reading answers all three states.',
  'Two lines left.',
  'Last line, and the fade has stood down.',
] as const;

const styles = css.create({
  header: {
    padding: dimensions.space4,
    backgroundColor: colors.surface,
    borderRadius: dimensions.radiusLg,
    boxShadow: colors.floatShadow,
  },
  matrix: {
    display: 'grid',
    gridTemplateColumns: `${STATE_LABEL_PX}px repeat(2, minmax(0, 1fr))`,
    alignItems: 'center',
    gap: dimensions.space3,
  },
  column: { textAlign: 'center' },
  sizeRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: dimensions.space4,
  },
  disclosureSummary: {
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space3,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    fontSize: dimensions.fontSizeMd,
    color: colors.textStrong,
  },
  disclosureBody: {
    margin: 0,
    paddingBottom: dimensions.space4,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    color: colors.text,
  },
  link: { color: colors.brandText, textDecorationLine: 'underline' },
  cueFrame: {
    display: 'flex',
    height: SCROLL_CUE_FRAME_PX,
    backgroundColor: colors.surface,
    borderWidth: dimensions.borderWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    borderRadius: dimensions.radiusLg,
    overflow: 'hidden',
  },
  pickers: { alignItems: 'flex-start' },
  cueLine: { margin: 0, color: colors.text, fontSize: dimensions.fontSizeSm },
  standalone: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    color: colors.textStrong,
  },
});

const ignore = () => {};

function DialogHeaderSection() {
  const [open, setOpen] = useState(true);
  return (
    <Section
      id="dialog-header"
      file="rsdDrawing/DialogHeader.tsx"
      intro="Back and close share a 48px target and `colors.iconInk` glyphs. Back sits on a brand-wash paint blob with extra space before the title; close has an outlined disc. The title can wrap; optional actions sit beside close."
    >
      <html.div style={styles.header}>
        {open ? (
          <DialogHeader
            title="Appearance"
            titleSize="xl"
            onBack={ignore}
            onClose={() => setOpen(false)}
          />
        ) : (
          <RsdButton variant="wash" size="sm" onPress={() => setOpen(true)}>
            Show the header again
          </RsdButton>
        )}
      </html.div>
    </Section>
  );
}

function ButtonSection() {
  const [busy, setBusy] = useState(false);
  return (
    <Section
      id="button"
      file="rsdDrawing/RsdButton.tsx"
      intro="Four variants, one set of states. `brand` is the primary action; `wash` is secondary or selected; `outline` is the quiet secondary for dense rows and toolbars; `danger` confirms something destructive. Disabled drops every variant to the same neutral treatment (`colors.controlTrack` fill, `colors.text` label at `dimensions.disabledOpacity`; outline keeps a `colors.border` hairline instead), so a parked button cannot be mistaken for a live one on either paper. `busy` implies disabled, sets `aria-busy`, keeps the variant's fill, and adds a ring in the label's ink before the label."
    >
      <html.div style={[specimen.panel, styles.matrix]}>
        <html.span style={specimen.label}>States</html.span>
        <html.span style={[specimen.meta, styles.column]}>Live: hover, press</html.span>
        <html.span style={[specimen.meta, styles.column]}>Disabled</html.span>
        {BUTTON_VARIANTS.map((variant) => (
          <Fragment key={variant}>
            <Code>{variant}</Code>
            <RsdButton variant={variant} onPress={ignore}>
              {variant}
            </RsdButton>
            <RsdButton variant={variant} disabled onPress={ignore}>
              {variant}
            </RsdButton>
          </Fragment>
        ))}
      </html.div>
      <html.div style={specimen.panel}>
        <html.span style={specimen.label}>Sizes</html.span>
        {SIZES.map(({ size, note }) => (
          <html.div key={size} style={styles.sizeRow}>
            <RsdButton variant="brand" size={size} onPress={ignore}>
              Send report
            </RsdButton>
            <html.span style={specimen.meta}>{`${size} · ${note}`}</html.span>
          </html.div>
        ))}
      </html.div>
      <html.div style={[specimen.panel, styles.sizeRow]}>
        <html.span style={specimen.label}>Busy</html.span>
        <RsdButton variant="brand" busy={busy} onPress={() => setBusy(true)}>
          {busy ? 'Sending report' : 'Send report'}
        </RsdButton>
        {busy ? (
          <RsdButton variant="outline" size="sm" onPress={() => setBusy(false)}>
            Reset
          </RsdButton>
        ) : (
          <html.span style={specimen.meta}>Tap to see the busy state.</html.span>
        )}
      </html.div>
    </Section>
  );
}

const THEMES = [
  { value: 'light', label: 'Light', icon: 'theme-light' },
  { value: 'dark', label: 'Dark', icon: 'theme-dark' },
  { value: 'system', label: 'System', icon: 'theme-auto', disabled: true },
] as const;
const VIEWS = [
  { value: 'android', label: 'First view', icon: 'android' },
  { value: 'ios', label: 'Second view', icon: 'phone-tablet' },
] as const;
const CHIPS = [
  { value: 'eraser', label: 'Eraser', icon: 'brush-eraser' },
  { value: 'camera', label: 'Screenshot', icon: 'camera' },
] as const;

function SegmentedPickerSection() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]['value']>('light');
  const [collapsed, setCollapsed] = useState<(typeof THEMES)[number]['value']>('light');
  const [view, setView] = useState<(typeof VIEWS)[number]['value']>('android');
  const [chips, setChips] = useState<readonly (typeof CHIPS)[number]['value'][]>(['eraser']);
  return (
    <Section
      id="segmented-picker"
      file="rsdDrawing/RsdSegmentedPicker.tsx"
      intro="Choose `segment` for a single choice, `chip` for independent toggles, or `underline` for switching views. Radio mode selects one option; `toggle` mode lets the caller support deselection or several choices. Hidden labels keep each icon's accessible name and touch target. All live."
    >
      <html.div style={[specimen.panel, styles.pickers]}>
        <RsdSegmentedPicker label="Theme" options={THEMES} selected={theme} onSelect={setTheme} />
        <RsdSegmentedPicker
          label="Theme, icons only"
          options={THEMES}
          selected={collapsed}
          onSelect={setCollapsed}
          labels="hidden"
        />
        <RsdSegmentedPicker
          label="View"
          variant="underline"
          options={VIEWS}
          selected={view}
          onSelect={setView}
        />
        <RsdSegmentedPicker
          label="Tools"
          variant="chip"
          mode="toggle"
          options={CHIPS}
          selected={chips}
          onSelect={(value) =>
            setChips((current) =>
              current.includes(value)
                ? current.filter((chip) => chip !== value)
                : [...current, value]
            )
          }
        />
      </html.div>
    </Section>
  );
}

function StatusMessageSection() {
  return (
    <Section
      id="status-message"
      file="rsdDrawing/RsdStatusMessage.tsx"
      intro="The form-result banner, filled with its status wash. Success and warning announce politely; an error interrupts. Render it only when there is a message."
    >
      <html.div style={specimen.panel}>
        <RsdStatusMessage status="success">
          Success message: the action is complete.
        </RsdStatusMessage>
        <RsdStatusMessage status="error">Error message: explain what went wrong.</RsdStatusMessage>
        <RsdStatusMessage status="warning">
          Warning heading. Describe what needs attention, with an optional detail.
        </RsdStatusMessage>
      </html.div>
    </Section>
  );
}

function RuleLabelSection() {
  return (
    <Section
      id="rule-label"
      file="rsdDrawing/RsdRuleLabel.tsx"
      intro="An uppercase heading with a trailing hairline: the section marker on standalone pages and, in its strong tier, the section heads inside Settings."
    >
      <html.div style={specimen.panel}>
        <RsdRuleLabel as="h4">Heading</RsdRuleLabel>
        <html.p style={specimen.intro}>Description or section content.</html.p>
        <RsdRuleLabel as="h4" strong>
          Strong heading
        </RsdRuleLabel>
        <html.p style={specimen.intro}>
          The heavier tier: section heads inside Settings, over the controls they name.
        </html.p>
      </html.div>
    </Section>
  );
}

function DisclosureSection() {
  return (
    <Section
      id="disclosure"
      file="rsdDrawing/RsdDisclosure.tsx"
      intro="The primitive owns the bordered shell and the › chevron that turns on open. Padding, type, color and background stay with the call site."
    >
      <RsdDisclosure summary="Disclosure heading" summaryStyle={styles.disclosureSummary}>
        <html.p style={styles.disclosureBody}>
          The body the summary reveals. It renders only while open.
        </html.p>
      </RsdDisclosure>
    </Section>
  );
}

function ScrollCueSection() {
  return (
    <Section
      id="scroll-cue"
      file="rsdDrawing/RsdScrollCue.tsx"
      intro="The fade that says a scroller's content carries on below: absent while content fits, present while more remains under the fold, and absent again once the end is on screen. Live: scroll it."
    >
      <html.div style={styles.cueFrame}>
        <RsdScrollCue inset={SCROLL_CUE_INSET}>
          {SCROLL_CUE_LINES.map((line) => (
            <html.p key={line} style={styles.cueLine}>
              {line}
            </html.p>
          ))}
        </RsdScrollCue>
      </html.div>
    </Section>
  );
}

function VisuallyHiddenSection() {
  return (
    <Section
      id="visually-hidden"
      file="rsdDrawing/RsdVisuallyHidden.tsx"
      intro="Text a screen reader announces and the page never shows, such as the word an icon stands in for. The live form speaks its changes politely."
    >
      <html.p style={specimen.intro}>
        Open the <RsdVisuallyHidden>three-dot </RsdVisuallyHidden>menu
      </html.p>
      <html.p style={specimen.meta}>
        A screen reader reads the line above as “Open the three-dot menu.”
      </html.p>
    </Section>
  );
}

function ExternalMarkSection() {
  const theme = useDrawingTheme();
  return (
    <Section
      id="external-mark"
      file="rsdDrawing/RsdExternalMark.tsx"
      intro="The paint blob that ends every link opening outside Splotch, so a grown-up sees it leave the app before the parental gate asks. It names itself “(opens outside Splotch)” for assistive technology. `inline` takes the link's ink in running prose; `standalone` sits muted beside an icon-led link on its own line."
    >
      <html.p style={specimen.intro}>
        <html.span style={styles.link}>
          Read the source on GitHub
          <RsdExternalMark variant="inline" ink={theme.brandText} />
        </html.span>
        , where every line of this page lives.
      </html.p>
      <html.span style={styles.standalone}>
        View on GitHub
        <RsdExternalMark variant="standalone" />
      </html.span>
      <html.p style={specimen.meta}>
        Both specimens are plain text here: on a page, the mark sits inside the link the grown-up
        check guards (<Code>RsdGatedAnchor</Code>).
      </html.p>
    </Section>
  );
}

export function PrimitiveSections() {
  return (
    <>
      <DialogHeaderSection />
      <ButtonSection />
      <SegmentedPickerSection />
      <StatusMessageSection />
      <RuleLabelSection />
      <DisclosureSection />
      <ScrollCueSection />
      <VisuallyHiddenSection />
      <ExternalMarkSection />
    </>
  );
}
