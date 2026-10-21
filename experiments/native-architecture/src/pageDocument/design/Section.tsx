import type { ReactNode } from 'react';
import { html } from 'react-strict-dom';
import { DESIGN_SECTIONS, type DesignSectionId } from './designSections';
import { specimen } from './designStyles';

// One styleguide section: its heading, named from the section list, an intro, and its specimens.
export function Section({
  id,
  file,
  intro,
  children,
}: {
  id: DesignSectionId;
  file?: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  const section = DESIGN_SECTIONS.find((candidate) => candidate.id === id);
  return (
    <html.section id={id} aria-labelledby={`${id}-heading`} style={specimen.section}>
      <html.h3 id={`${id}-heading`} style={specimen.heading}>
        {section?.label}
        {file ? <html.code style={[specimen.code, specimen.file]}>{` ${file}`}</html.code> : null}
      </html.h3>
      <html.p style={specimen.intro}>
        {typeof intro === 'string' ? <Prose text={intro} /> : intro}
      </html.p>
      {children}
    </html.section>
  );
}

export function Code({ children }: { children: string }) {
  return <html.code style={specimen.code}>{children}</html.code>;
}

// Prose whose `backticked` spans are token or code names, printed as code.
export function Prose({ text }: { text: string }) {
  return text
    .split('`')
    .map((part, index) =>
      index % 2 === 1 ? (
        <Code key={index}>{part}</Code>
      ) : part ? (
        <html.span key={index}>{part}</html.span>
      ) : null
    );
}
