import { html } from 'react-strict-dom';
import { APP_VERSION, INFORMATION_CONTENT, type InformationPage } from '../information/content';
import { RsdAction, styles } from './controls';

export function RsdInformationSection({
  page,
  onNavigate,
}: {
  page: InformationPage;
  onNavigate: (page: InformationPage) => void;
}) {
  const content = INFORMATION_CONTENT[page];
  return (
    <html.div style={styles.dialogContent}>
      <html.span>{`Splotch ${APP_VERSION} · Beta`}</html.span>
      {content.sections.map((section) => (
        <html.div key={section.title} style={styles.stack}>
          <html.h2 style={styles.boldText}>{section.title}</html.h2>
          {section.paragraphs.map((paragraph) => (
            <html.p key={paragraph}>{paragraph}</html.p>
          ))}
        </html.div>
      ))}
      {page === 'help' ? (
        <html.div style={styles.row}>
          <RsdAction label="Privacy" onClick={() => onNavigate('privacy')} />
          <RsdAction label="What’s new" onClick={() => onNavigate('whatsNew')} />
        </html.div>
      ) : (
        <RsdAction label="Back to help and about" onClick={() => onNavigate('help')} />
      )}
    </html.div>
  );
}
