import { View } from 'react-native';
import { Text } from '../drawing/Text';
import { Action } from '../DrawingControls';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { APP_VERSION, INFORMATION_CONTENT, type InformationPage } from './content';

export function InformationSection({
  page,
  onNavigate,
}: {
  page: InformationPage;
  onNavigate: (page: InformationPage) => void;
}) {
  const styles = useDrawingScreenStyles();
  const content = INFORMATION_CONTENT[page];
  return (
    <View style={styles.controls}>
      <Text accessibilityRole="header" style={styles.title}>
        {content.title}
      </Text>
      <Text style={styles.notice}>{`Splotch ${APP_VERSION} · Beta`}</Text>
      {content.sections.map((section) => (
        <View key={section.title} style={styles.controls}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={styles.notice}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
      {page === 'help' ? (
        <>
          <Action label="Privacy" onPress={() => onNavigate('privacy')} />
          <Action label="What’s new" onPress={() => onNavigate('whatsNew')} />
        </>
      ) : (
        <Action label="Back to help and about" onPress={() => onNavigate('help')} />
      )}
    </View>
  );
}
