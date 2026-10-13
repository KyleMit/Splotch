import { Fragment, type ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import type { InstallTextPart } from '../install/installCopy';
import { styles as controlStyles } from './controls';
import type { NativeIconName } from './icons.generated';
import { RsdIcon } from './RsdIcon';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';
import { colors } from './tokens.css';

const styles = css.create({
  term: { whiteSpace: 'nowrap', color: colors.textStrong },
  inlineIcon: { display: 'inline-flex', verticalAlign: '-0.125em' },
});

function InlineIcon({
  name,
  ink,
  px,
}: {
  name: NativeIconName;
  ink: string | undefined;
  px: number;
}) {
  return (
    <html.span aria-hidden style={styles.inlineIcon}>
      <RsdIcon name={name} size={px} ink={ink} muted={false} />
    </html.span>
  );
}

function TextPart({
  part,
  termInk,
  iconPx,
}: {
  part: InstallTextPart;
  termInk: string;
  iconPx: number;
}): ReactNode {
  if (part.kind === 'text') return part.text;
  if (part.kind === 'strong')
    return <html.strong style={controlStyles.boldText}>{part.text}</html.strong>;
  if (part.kind === 'icon') return <InlineIcon name={part.icon} ink={undefined} px={iconPx} />;
  return (
    <html.span style={[controlStyles.boldText, styles.term]}>
      <InlineIcon name={part.icon} ink={part.textInk ? termInk : undefined} px={iconPx} />
      {part.spoken ? <RsdVisuallyHidden>{part.spoken}</RsdVisuallyHidden> : null}
      {part.text}
    </html.span>
  );
}

// One install sentence with its bold runs and inline icons, shared by the Install Banner and the
// Settings install guide, each at its own icon size. Its own small module because the two load in
// separate web chunks, and a module two chunks share is hoisted onto the startup path.
export function InstallText({
  parts,
  iconPx,
}: {
  parts: readonly InstallTextPart[];
  iconPx: number;
}) {
  const termInk = useDrawingTheme().textStrong;
  return parts.map((part, index) => (
    <Fragment key={index}>
      <TextPart part={part} termInk={termInk} iconPx={iconPx} />
    </Fragment>
  ));
}
