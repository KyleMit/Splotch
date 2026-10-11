import { useModalAnimation } from './drawing/useModalAnimation';
import { useDrawingAppearance } from './drawing/DrawingAppearance';
import { createDrawingStyles, useDrawingStyles } from './drawing/DrawingAppearance';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { PAPER_HEIGHT, PAPER_WIDTH } from './drawing/model';
import { InkAppearanceScope } from './drawing/InkAppearance';
import { PageOutline } from './drawing/PageOutline';
import { COLORING_PAGES, PAGE_IDS, type PageId } from './drawing/pages';
import { DRAWING_SCALE, DRAWING_SCRIM, PAPER_THEMES, TOUCH_TARGET } from './drawing/theme';

const PICKER_MAX_WIDTH_PX = 512;
const TILE_MIN_WIDTH_PX = 132;
const TILE_SELECTED_BORDER_PX = 3;

export function ColoringPagePicker({
  selected,
  onChoose,
  onClose,
}: {
  selected: PageId;
  onChoose: (pageId: PageId) => void;
  onClose: () => void;
}) {
  const animationType = useModalAnimation();
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingAppearance();
  return (
    <Modal visible transparent animationType={animationType} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          role="dialog"
          accessibilityLabel="Coloring pages"
          accessibilityViewIsModal
          style={styles.card}
        >
          <Text accessibilityRole="header" style={styles.title}>
            Choose a page
          </Text>
          <Text style={styles.help}>Your drawing stays. Undo brings the last page back.</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {PAGE_IDS.map((pageId) => (
              <Pressable
                key={pageId}
                accessibilityRole="radio"
                accessibilityLabel={COLORING_PAGES[pageId].label}
                accessibilityState={{ checked: pageId === selected }}
                aria-checked={pageId === selected}
                onPress={() => onChoose(pageId)}
                style={({ pressed }) => [
                  styles.tile,
                  pageId === selected && styles.selectedTile,
                  pressed && styles.pressed,
                ]}
              >
                <View pointerEvents="none" style={styles.preview}>
                  <InkAppearanceScope.Provider value={{ pageId, theme }}>
                    <Svg width="100%" height="100%" viewBox={`0 0 ${PAPER_WIDTH} ${PAPER_HEIGHT}`}>
                      <Rect
                        width={PAPER_WIDTH}
                        height={PAPER_HEIGHT}
                        fill={PAPER_THEMES[theme].paper}
                      />
                      <PageOutline pageId={pageId} />
                    </Svg>
                  </InkAppearanceScope.Provider>
                </View>
                <Text style={styles.label}>{COLORING_PAGES[pageId].label}</Text>
                <Text style={styles.selection}>{pageId === selected ? 'Selected' : 'Choose'}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Text style={styles.label}>Keep drawing</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: DRAWING_SCRIM,
      padding: DRAWING_SCALE.space4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      width: '100%',
      maxWidth: PICKER_MAX_WIDTH_PX,
      maxHeight: '90%',
      backgroundColor: palette.surface,
      padding: DRAWING_SCALE.space4,
      borderRadius: DRAWING_SCALE.radiusLg,
      gap: DRAWING_SCALE.space3,
    },
    title: {
      color: palette.textStrong,
      fontSize: DRAWING_SCALE.fontSizeXl,
      fontWeight: DRAWING_SCALE.fontWeightBold,
    },
    help: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeSm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: DRAWING_SCALE.space3 },
    tile: {
      flexBasis: '46%',
      flexGrow: 1,
      minWidth: TILE_MIN_WIDTH_PX,
      minHeight: TOUCH_TARGET,
      padding: DRAWING_SCALE.space2,
      borderRadius: DRAWING_SCALE.radiusMd,
      borderWidth: TILE_SELECTED_BORDER_PX,
      borderColor: palette.borderWarm,
      backgroundColor: palette.paper,
      gap: DRAWING_SCALE.space1,
    },
    selectedTile: { borderColor: palette.brandSolid, backgroundColor: palette.brandWash },
    preview: { width: '100%', aspectRatio: PAPER_WIDTH / PAPER_HEIGHT },
    label: {
      color: palette.textStrong,
      fontSize: DRAWING_SCALE.fontSizeMd,
      fontWeight: DRAWING_SCALE.fontWeightSemibold,
    },
    selection: { color: palette.textSoft, fontSize: DRAWING_SCALE.fontSizeSm },
    close: {
      minHeight: TOUCH_TARGET,
      borderRadius: DRAWING_SCALE.radiusMd,
      borderWidth: 1,
      borderColor: palette.borderWarm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { backgroundColor: palette.brandWash },
  })
);
