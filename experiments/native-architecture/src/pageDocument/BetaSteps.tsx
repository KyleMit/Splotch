import { type CSSProperties, type ReactNode } from 'react';
import { css } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { paletteHex, type PaletteLabel } from '../drawing/palette';
import { buttonSkin } from '../rsdDrawing/RsdButton';
import { RsdExternalMark } from '../rsdDrawing/RsdExternalMark';
import { RsdIcon } from '../rsdDrawing/RsdIcon';
import { RsdStepNumber } from '../rsdDrawing/RsdStepNumberContent';
import { mixSrgb } from '../rsdDrawing/colorMix';
import { PAGE_LINE_HEIGHT } from '../rsdDrawing/pageTypography.web';
import { colors, dimensions, fonts } from '../rsdDrawing/tokens.css';
import { BETA_COPY } from './betaCopy';

// /beta's steps and troubleshooting rows: shipping's BetaStep.svelte, BetaStepLedger.svelte and
// BetaTroubleshooting.svelte.

export const TROUBLE_ATTRIBUTE = 'data-beta-trouble';
export const CHEVRON_ATTRIBUTE = 'data-beta-chevron';
const TROUBLE_SUB_CLAUSE_MAX_WIDTH_PX = 480;

// BetaStep.svelte's four hues, one per step.
const STEP_HUES: Record<1 | 2 | 3 | 4, PaletteLabel> = {
  1: 'Red',
  2: 'Orange',
  3: 'Green',
  4: 'Blue',
};
const CARD_WASH_PERCENT = 9;
const CARD_INK_PERCENT = 45;
const STEP = {
  wide: { gap: 56, number: 32 },
  phone: { gap: 42, number: 26 },
  gutter: 52,
  rail: 2,
  railInset: 8,
  headGap: 10,
  bodyTop: 14,
  actionTop: 18,
  cardTop: 22,
  cardBorder: 3,
  cardPadding: { block: 14, inline: 18 },
  cardLabelBottom: 4,
} as const;
const BODY_LINE_HEIGHT = 1.65;
const CARD_LINE_HEIGHT = 1.6;
const TROUBLE_LINE_HEIGHT = 1.45;
export const HEADING_LINE_HEIGHT = 1.25;
const EYEBROW_TRACKING = '0.12em';
const MEASURE = '62ch';
export const PICKER_BOTTOM_PX = 34;
export const JUMP_GAP_PX = 28;
export const JUMP_PADDING_PX = { top: 9, side: 2, bottom: 11 };
export const JUMP_UNDERLINE_PX = 3;
const TROUBLE = { top: 48, gap: 16, padding: { block: 18, inline: 20 }, chevron: 32, icon: 18 };
const TROUBLE_ROW_PX = 20;
const LINK_UNDERLINE_OFFSET_PX = 3;
export const TOUCH_TARGET_PX = 44;

// The page's own boxes take inline styles rather than css.create: every css.create in the app's
// sources compiles into strict.css, which the drawing screen inlines into its first paint, and these
// styles belong to this document alone. The design tokens still theme them (tokens.css.ts).
const BOLD: CSSProperties = {
  fontFamily: fonts.boldFamily,
  fontWeight: fonts.boldWeight,
};
export const SEMIBOLD: CSSProperties = {
  fontFamily: fonts.semiboldFamily,
  fontWeight: fonts.semiboldWeight,
};
const MEDIUM: CSSProperties = {
  fontFamily: fonts.mediumFamily,
  fontWeight: fonts.mediumWeight,
};
const LINK: CSSProperties = {
  color: colors.brandText,
  textDecorationLine: 'underline',
  textDecorationThickness: 1,
  textUnderlineOffset: LINK_UNDERLINE_OFFSET_PX,
};
const EYEBROW: CSSProperties = {
  fontSize: dimensions.fontSizeXs,
  letterSpacing: EYEBROW_TRACKING,
  textTransform: 'uppercase',
};
const FLUSH_COPY: CSSProperties = {
  ...MEDIUM,
  margin: 0,
  fontSize: dimensions.fontSizeSm,
  lineHeight: CARD_LINE_HEIGHT,
  color: colors.text,
};
export const RULE = `${dimensions.borderWidth} solid ${colors.border}`;

export function Strong({ children }: { children: string }) {
  return <strong style={{ ...BOLD, color: colors.textStrong }}>{children}</strong>;
}

export function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} style={LINK}>
      {children}
    </a>
  );
}

export function OutsideLink({ href, children }: { href: string; children: string }) {
  const theme = useDrawingTheme();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={LINK}>
      {children}
      <RsdExternalMark variant="inline" ink={theme.brandText} />
    </a>
  );
}

// Button.svelte's brand lg skin on the step's anchor, full width on a phone.
function StepAction({
  href,
  label,
  external,
  phone,
}: {
  href: string;
  label: string;
  external: boolean;
  phone: boolean;
}) {
  const skin = buttonSkin();
  const chrome = css.props(skin.button, skin.lg, skin.brand);
  return (
    <div style={{ marginTop: STEP.actionTop }}>
      <a
        {...chrome}
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        style={{
          ...chrome.style,
          display: 'inline-flex',
          boxSizing: 'border-box',
          width: phone ? '100%' : undefined,
          lineHeight: PAGE_LINE_HEIGHT,
          textDecoration: 'none',
          touchAction: 'manipulation',
        }}
      >
        {label}
      </a>
    </div>
  );
}

type StepProps = {
  number: 1 | 2 | 3 | 4;
  title: string;
  action: { href: string; label: string; external?: boolean };
  optional?: boolean;
  card?: { label: string; body: ReactNode } | null;
  last?: boolean;
  phone: boolean;
  children: ReactNode;
};

// BetaStep.svelte: a numbered step on the ledger's rail, its action, and an optional card.
export function BetaStep({
  number,
  title,
  action,
  optional,
  card,
  last,
  phone,
  children,
}: StepProps) {
  const theme = useDrawingTheme();
  const hue = paletteHex(STEP_HUES[number]);
  const { gap, number: numberPx } = phone ? STEP.phone : STEP.wide;
  return (
    <li style={{ position: 'relative', paddingLeft: phone ? 0 : STEP.gutter }}>
      {!phone && !last ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: (numberPx - STEP.rail) / 2,
            top: numberPx + STEP.railInset,
            bottom: STEP.railInset - gap,
            width: STEP.rail,
            backgroundColor: colors.border,
          }}
        />
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: STEP.headGap,
          minHeight: numberPx,
        }}
      >
        <div style={phone ? undefined : { position: 'absolute', left: 0, top: 0, zIndex: 1 }}>
          <RsdStepNumber
            number={number}
            size={phone ? 'summary' : 'regular'}
            shape="blob"
            hue={STEP_HUES[number]}
          />
        </div>
        <h3
          style={{
            ...BOLD,
            margin: 0,
            fontSize: phone ? dimensions.fontSizeLg : dimensions.fontSizeXl,
            lineHeight: HEADING_LINE_HEIGHT,
            color: colors.textStrong,
          }}
        >
          {title}
        </h3>
        {optional ? (
          <span style={{ ...SEMIBOLD, ...EYEBROW, color: colors.textSoft }}>
            {BETA_COPY.optional}
          </span>
        ) : null}
      </div>
      <p
        style={{
          ...MEDIUM,
          marginTop: STEP.bodyTop,
          marginBottom: 0,
          maxWidth: MEASURE,
          fontSize: dimensions.fontSizeMd,
          lineHeight: BODY_LINE_HEIGHT,
          color: colors.text,
          textWrap: 'pretty',
        }}
      >
        {children}
      </p>
      <StepAction
        href={action.href}
        label={action.label}
        external={action.external ?? true}
        phone={phone}
      />
      {card ? (
        <div
          style={{
            maxWidth: MEASURE,
            marginTop: STEP.cardTop,
            padding: `${STEP.cardPadding.block}px ${STEP.cardPadding.inline}px`,
            borderLeft: `${STEP.cardBorder}px solid ${hue}`,
            borderRadius: `0 ${dimensions.radiusMd} ${dimensions.radiusMd} 0`,
            backgroundColor: mixSrgb(hue, CARD_WASH_PERCENT, theme.surface),
          }}
        >
          <p
            style={{
              ...BOLD,
              ...EYEBROW,
              marginTop: 0,
              marginBottom: STEP.cardLabelBottom,
              color: mixSrgb(hue, CARD_INK_PERCENT, theme.textStrong),
            }}
          >
            {card.label}
          </p>
          <p style={FLUSH_COPY}>{card.body}</p>
        </div>
      ) : null}
    </li>
  );
}

export function Ledger({ phone, children }: { phone: boolean; children: ReactNode }) {
  return (
    <ol
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: (phone ? STEP.phone : STEP.wide).gap,
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {children}
    </ol>
  );
}

export function TroubleRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: TROUBLE_ROW_PX,
        paddingTop: TROUBLE_ROW_PX,
        borderTop: RULE,
      }}
    >
      <h4
        style={{
          ...BOLD,
          margin: `0 0 ${dimensions.space1}`,
          fontSize: dimensions.fontSizeMd,
          color: colors.textStrong,
        }}
      >
        {title}
      </h4>
      <p style={FLUSH_COPY}>{children}</p>
    </div>
  );
}

// BetaTroubleshooting.svelte: a native disclosure, which opens with or without a script.
export function Troubleshooting({
  summary,
  clause,
  width,
  children,
}: {
  summary: [string, string];
  clause: string;
  width: number;
  children: ReactNode;
}) {
  const theme = useDrawingTheme();
  return (
    <details
      {...{ [TROUBLE_ATTRIBUTE]: '' }}
      style={{
        marginTop: TROUBLE.top,
        border: RULE,
        borderRadius: dimensions.radiusLg,
        backgroundColor: colors.surface2,
      }}
    >
      <summary
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: TROUBLE.gap,
          padding: `${TROUBLE.padding.block}px ${TROUBLE.padding.inline}px`,
          cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3
            style={{
              ...BOLD,
              margin: 0,
              fontSize: dimensions.fontSizeLg,
              color: colors.textStrong,
            }}
          >
            {BETA_COPY.troubleshooting}
          </h3>
          <span
            style={{
              ...MEDIUM,
              fontSize: dimensions.fontSizeSm,
              lineHeight: TROUBLE_LINE_HEIGHT,
              color: colors.textSoft,
            }}
          >
            {summary[0]}
            {width > TROUBLE_SUB_CLAUSE_MAX_WIDTH_PX ? `${clause}\u00a0` : ''}
            {summary[1]}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: TROUBLE.chevron,
            height: TROUBLE.chevron,
            border: RULE,
            borderRadius: dimensions.radiusPill,
            backgroundColor: colors.surface,
          }}
        >
          <span {...{ [CHEVRON_ATTRIBUTE]: '' }} style={{ display: 'flex' }}>
            <RsdIcon name="chevron-right" size={TROUBLE.icon} ink={theme.textSoft} muted={false} />
          </span>
        </span>
      </summary>
      <div
        style={{
          padding: `0 ${TROUBLE.padding.inline}px ${dimensions.space2}`,
        }}
      >
        {children}
      </div>
    </details>
  );
}
