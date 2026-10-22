import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { css, html } from 'react-strict-dom';
import { DrawingAppearanceProvider, useDrawingAppearance } from '../../drawing/DrawingAppearance';
import type { PaperTheme } from '../../drawing/theme';
import { bootAppearance } from '../../platform/bootAppearance';
import { setDocumentTitle } from '../../platform/appPath';
import { ShippingFontGate } from '../../platform/shippingFont';
import { RsdBackLink, RsdBrandMark } from '../../rsdDrawing/RsdNotFoundPage';
import { COLD_VISIT_LABEL } from '../../lib/components/page/backLabel';
import { RsdRuleLabel } from '../../rsdDrawing/RsdRuleLabel';
import { DESIGN_PAGE_SCROLLER_TEST_ID } from '../../rsdDrawing/pageFrame';
import { RsdSegmentedPicker } from '../../rsdDrawing/RsdSegmentedPicker';
import { colors, darkTheme, dimensions, fonts } from '../../rsdDrawing/tokens.css';
import type { AppearancePreference } from '../../settings/appearance';
import { BrandSections } from './BrandSections';
import { ComponentSections } from './ComponentSections';
import {
  DESIGN_COPY,
  DESIGN_PARTS,
  DESIGN_SECTIONS,
  type DesignPart,
  type DesignSectionId,
} from './designSections';
import { specimen } from './designStyles';
import { Prose } from './Section';
import { FoundationSections } from './FoundationSections';
import { PrimitiveSections } from './PrimitiveSections';

const WIDE = '@media (min-width: 980px)';
const ROOMY_HEADER = '@media (min-width: 360px)';
const SHELL_MAX_WIDTH_PX = 1200;
const SIDEBAR_WIDTH_PX = 216;
const CONTENT_MAX_WIDTH_PX = 820;
const SHELL_GAP_PX = 40;
const HEADER_HEIGHT_PX = 64;
const READING_LINE_HEIGHT = 1.62;
const DISPLAY_LINE_HEIGHT = 1.08;
const DISPLAY_TRACKING = '-0.015em';
const PART_GAP_PX = 64;
const EYEBROW_TRACKING = '0.12em';
const ACTIVE_RAIL_PX = 3;
// How far under the header a heading may sit and still count as the one being read.
const SPY_BAND_PX = 56;
const TOP_ID = 'top';
const CONTENTS_COLUMN_MIN_PX = 150;
const TOC_ROW_PADDING_PX = 10;

const styles = css.create({
  root: {
    display: 'block',
    flexGrow: 1,
    height: '100%',
    overflowY: 'auto',
    backgroundColor: colors.appBg,
    color: colors.textStrong,
    fontFamily: fonts.family,
    fontSize: dimensions.fontSizeMd,
    lineHeight: READING_LINE_HEIGHT,
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: colors.surface,
    boxShadow: colors.floatShadow,
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dimensions.space4,
    minHeight: HEADER_HEIGHT_PX,
    maxWidth: SHELL_MAX_WIDTH_PX,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: { default: dimensions.space4, [WIDE]: dimensions.space7 },
    paddingRight: { default: dimensions.space4, [WIDE]: dimensions.space7 },
  },
  // The narrowest phones keep the theme picker and drop the mark, which the hero's link repeats.
  headerMark: { display: { default: 'none', [ROOMY_HEADER]: 'flex' } },
  headerStart: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: dimensions.space3,
  },
  headerTitle: {
    display: { default: 'none', [WIDE]: 'block' },
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
  },
  shell: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SHELL_GAP_PX,
    maxWidth: SHELL_MAX_WIDTH_PX,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingLeft: { default: dimensions.space4, [WIDE]: dimensions.space7 },
    paddingRight: { default: dimensions.space4, [WIDE]: dimensions.space7 },
    paddingBottom: dimensions.space8,
  },
  // Its padding sits inside the window's height, so the last contents label stays in view.
  sidebar: {
    boxSizing: 'border-box',
    display: { default: 'none', [WIDE]: 'flex' },
    flexDirection: 'column',
    gap: dimensions.space5,
    position: 'sticky',
    top: HEADER_HEIGHT_PX,
    width: SIDEBAR_WIDTH_PX,
    flexShrink: 0,
    maxHeight: `calc(100vh - ${HEADER_HEIGHT_PX}px)`,
    overflowY: 'auto',
    paddingTop: dimensions.space7,
    paddingBottom: dimensions.space6,
  },
  main: { flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: CONTENT_MAX_WIDTH_PX },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space4,
    paddingTop: dimensions.space8,
  },
  heroBack: { display: { default: 'flex', [WIDE]: 'none' } },
  title: {
    margin: 0,
    color: colors.textStrong,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    fontSize: { default: dimensions.fontSizeDisplayMin, [WIDE]: dimensions.fontSizeDisplayMax },
    lineHeight: DISPLAY_LINE_HEIGHT,
    letterSpacing: DISPLAY_TRACKING,
  },
  lede: {
    margin: 0,
    maxWidth: '62ch',
    color: colors.text,
    fontSize: dimensions.fontSizeLg,
    fontFamily: fonts.mediumFamily,
    fontWeight: fonts.mediumWeight,
  },
  defaults: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space2,
    marginTop: dimensions.space6,
    padding: dimensions.space5,
    backgroundColor: colors.brandWash,
    borderRadius: dimensions.radiusLg,
  },
  defaultsText: {
    margin: 0,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
  },
  defaultsTitle: {
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeMd,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  contents: {
    display: { default: 'flex', [WIDE]: 'none' },
    flexDirection: 'column',
    gap: dimensions.space3,
    marginTop: dimensions.space6,
  },
  contentsGroups: {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${CONTENTS_COLUMN_MIN_PX}px, 1fr))`,
    gap: dimensions.space4,
  },
  tocGroup: { display: 'flex', flexDirection: 'column', gap: dimensions.space1 },
  tocGroupLabel: {
    color: colors.labelInk,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    letterSpacing: EYEBROW_TRACKING,
    textTransform: 'uppercase',
    paddingLeft: dimensions.space3,
  },
  tocList: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    borderLeftWidth: dimensions.borderWidth,
    borderLeftStyle: 'solid',
    borderLeftColor: colors.border,
  },
  tocLink: {
    display: 'block',
    marginLeft: -1,
    paddingTop: TOC_ROW_PADDING_PX,
    paddingBottom: TOC_ROW_PADDING_PX,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space2,
    color: colors.text,
    fontSize: dimensions.fontSizeSm,
    textDecorationLine: 'none',
    borderLeftWidth: ACTIVE_RAIL_PX,
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    borderTopRightRadius: dimensions.radiusSm,
    borderBottomRightRadius: dimensions.radiusSm,
  },
  tocActive: {
    color: colors.brandText,
    backgroundColor: colors.brandWash,
    borderLeftColor: colors.brandSolid,
  },
  part: {
    display: 'flex',
    flexDirection: 'column',
    gap: dimensions.space1,
    marginTop: PART_GAP_PX,
    paddingBottom: dimensions.space2,
    borderBottomWidth: dimensions.borderWidth,
    borderBottomStyle: 'solid',
    borderBottomColor: colors.border,
  },
  eyebrow: {
    color: colors.brandText,
    fontSize: dimensions.fontSizeXs,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    letterSpacing: EYEBROW_TRACKING,
    textTransform: 'uppercase',
  },
  partTitle: {
    margin: 0,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeXl,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
  },
  footer: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: dimensions.space3,
    marginTop: PART_GAP_PX,
    paddingTop: dimensions.space5,
    borderTopWidth: dimensions.borderWidth,
    borderTopStyle: 'solid',
    borderTopColor: colors.border,
    color: colors.textSoft,
    fontSize: dimensions.fontSizeXs,
  },
  backToTop: {
    color: colors.brandText,
    fontFamily: fonts.semiboldFamily,
    fontWeight: fonts.semiboldWeight,
    textDecorationLine: 'none',
  },
});

const PART_ORDER = Object.keys(DESIGN_PARTS) as DesignPart[];

function goHome() {
  location.assign('/');
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'theme-light' },
  { value: 'dark', label: 'Dark', icon: 'theme-dark' },
] as const;

function ThemePicker({ onSelect }: { onSelect: (theme: PaperTheme) => void }) {
  const theme = useDrawingAppearance();
  return (
    <RsdSegmentedPicker
      label="Preview theme"
      options={THEME_OPTIONS}
      selected={theme}
      onSelect={onSelect}
      tight
    />
  );
}

function Contents({ active, idPrefix }: { active: DesignSectionId | null; idPrefix: string }) {
  return PART_ORDER.map((part) => (
    <html.div key={part} style={styles.tocGroup}>
      <html.div id={`${idPrefix}-${part}`} style={styles.tocGroupLabel}>
        {DESIGN_PARTS[part].label}
      </html.div>
      <html.ul aria-labelledby={`${idPrefix}-${part}`} style={styles.tocList}>
        {DESIGN_SECTIONS.filter((section) => section.part === part).map((section) => (
          <html.li key={section.id}>
            <html.a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'location' : undefined}
              style={[styles.tocLink, active === section.id && styles.tocActive]}
            >
              {section.label}
            </html.a>
          </html.li>
        ))}
      </html.ul>
    </html.div>
  ));
}

// The section being read: the last whose heading has crossed the line under the header.
function useScrollspy(scroller: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState<DesignSectionId>(DESIGN_SECTIONS[0].id);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    // Section links glide once hydrated; without a script they jump, as shipping's do.
    node.style.scrollBehavior = 'smooth';
    let frame = 0;
    const spy = () => {
      frame = 0;
      const line = node.getBoundingClientRect().top + HEADER_HEIGHT_PX + SPY_BAND_PX;
      let next: DesignSectionId = DESIGN_SECTIONS[0].id;
      for (const { id } of DESIGN_SECTIONS) {
        const heading = document.getElementById(id);
        if (heading && heading.getBoundingClientRect().top <= line) next = id;
      }
      setActive(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    spy();
    return () => {
      node.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller]);
  return active;
}

function Part({ part, index }: { part: DesignPart; index: number }) {
  return (
    <html.div id={part} style={styles.part}>
      <html.span style={styles.eyebrow}>{`Part ${index + 1}`}</html.span>
      <html.h2 style={styles.partTitle}>{DESIGN_PARTS[part].label}</html.h2>
      <html.p style={specimen.intro}>{DESIGN_PARTS[part].intro}</html.p>
    </html.div>
  );
}

function Themed({ children }: { children: ReactNode }) {
  const theme = useDrawingAppearance();
  const scroller = useRef<HTMLDivElement | null>(null);
  const active = useScrollspy(scroller);
  return (
    <html.div
      ref={scroller}
      data-testid={DESIGN_PAGE_SCROLLER_TEST_ID}
      style={[styles.root, theme === 'dark' && darkTheme]}
    >
      {/* The scroller can't be its own fragment target: a link to it never scrolls its content. */}
      <html.div id={TOP_ID} />
      {children}
      <html.div style={styles.shell}>
        <html.nav aria-label={DESIGN_COPY.contents} style={styles.sidebar}>
          <RsdBackLink label={COLD_VISIT_LABEL} short={false} onDrawingReturn={goHome} />
          <Contents active={active} idPrefix="sidebar" />
        </html.nav>
        <html.main style={styles.main}>
          <html.div style={styles.hero}>
            <html.div style={styles.heroBack}>
              <RsdBackLink label={COLD_VISIT_LABEL} short={false} onDrawingReturn={goHome} />
            </html.div>
            <html.h1 style={styles.title}>{DESIGN_COPY.title}</html.h1>
            <html.p style={styles.lede}>{DESIGN_COPY.lede}</html.p>
            <html.p style={specimen.meta}>
              <Prose text={DESIGN_COPY.sources} />
            </html.p>
          </html.div>
          <html.aside aria-label="Default choices" style={styles.defaults}>
            <html.h2 style={styles.defaultsTitle}>{DESIGN_COPY.defaultsTitle}</html.h2>
            <html.p style={styles.defaultsText}>
              <Prose text={DESIGN_COPY.defaults} />
            </html.p>
          </html.aside>
          <html.nav aria-label={DESIGN_COPY.contents} style={styles.contents}>
            <RsdRuleLabel as="h2">{DESIGN_COPY.contents}</RsdRuleLabel>
            <html.div style={styles.contentsGroups}>
              <Contents active={null} idPrefix="contents" />
            </html.div>
          </html.nav>
          <Part part="foundations" index={0} />
          <FoundationSections />
          <Part part="primitives" index={1} />
          <PrimitiveSections />
          <Part part="components" index={2} />
          <ComponentSections />
          <Part part="brand" index={3} />
          <BrandSections />
          <html.footer style={styles.footer}>
            <html.span>{DESIGN_COPY.footer}</html.span>
            <html.a href={`#${TOP_ID}`} style={styles.backToTop}>
              {DESIGN_COPY.backToTop}
            </html.a>
          </html.footer>
        </html.main>
      </html.div>
    </html.div>
  );
}

// The public styleguide, rendered from the app's own tokens and components. Its theme picker
// previews either paper without touching the visitor's saved settings.
export function DesignDocument() {
  const [preference, setPreference] = useState<AppearancePreference>(bootAppearance);
  useEffect(() => {
    const previous = setDocumentTitle(DESIGN_COPY.documentTitle);
    return () => {
      setDocumentTitle(previous);
    };
  }, []);
  return (
    <ShippingFontGate>
      <DrawingAppearanceProvider preference={preference}>
        <Themed>
          <html.header style={styles.header}>
            <html.div style={styles.headerRow}>
              <html.div style={styles.headerStart}>
                <ThemePicker onSelect={setPreference} />
                <html.span style={styles.headerTitle}>Design system</html.span>
              </html.div>
              <html.div style={styles.headerMark}>
                <RsdBrandMark phone={false} narrow={false} onDrawingReturn={goHome} />
              </html.div>
            </html.div>
          </html.header>
        </Themed>
      </DrawingAppearanceProvider>
    </ShippingFontGate>
  );
}
