import type { RefObject } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import type { useDrawingScreen } from './useDrawingScreen';
import type { useDrawingSound } from './useDrawingSound';
import { BRUSHES, type Brush } from './drawing/brushes';
import { pageLabel } from './drawing/pages';
import { StrokeWidthSelector } from './drawing/StrokeWidthSelector';
import { useDrawingScreenStyles } from './drawing/drawingScreenStyles';

export function Action({
  label,
  disabled,
  onPress,
  primary = false,
  selected,
  accessibilityLabel = label,
  openerRef,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  primary?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  openerRef?: RefObject<View | null>;
}) {
  const styles = useDrawingScreenStyles();
  return (
    <Pressable
      ref={openerRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.primary,
        selected && styles.chosenBrush,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

function DrawingWidth({
  brush,
  disabled,
  sound,
}: {
  brush: Brush;
  disabled: boolean;
  sound: ReturnType<typeof useDrawingSound>;
}) {
  const tool = brush === 'eraser' ? 'eraser' : 'drawing';
  return (
    <StrokeWidthSelector
      tool={tool}
      selected={tool === 'eraser' ? sound.settings.eraserWidth : sound.settings.strokeWidth}
      disabled={disabled || sound.settings.status !== 'ready'}
      onChange={(width) => {
        void sound.owner?.settings.setWidth(tool, width);
      }}
    />
  );
}

function DrawingActions({
  disabled,
  save,
  showPictures,
  exportPicture,
  openSettings,
  openFeedback,
}: {
  disabled: boolean;
  save: () => void;
  showPictures: () => void;
  exportPicture: () => void;
  openSettings: () => void;
  openFeedback: () => void;
}) {
  const styles = useDrawingScreenStyles();
  return (
    <View style={styles.toolbar}>
      <Action
        label="Save picture"
        primary
        disabled={disabled}
        onPress={() => {
          void save();
        }}
      />
      <Action label="Settings" disabled={disabled} onPress={openSettings} />
      <Action label="Send Feedback" disabled={disabled} onPress={openFeedback} />
      <Action label="Pictures" disabled={disabled} onPress={showPictures} />
      <Action
        label="Export PNG"
        disabled={disabled}
        onPress={() => {
          void exportPicture();
        }}
      />
    </View>
  );
}

export function DrawingMenu({
  screen,
  sound,
  run,
  onClose,
  visible,
  onDismiss,
  onFeedback,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  run: (action: () => void) => void;
  onClose: () => void;
  visible: boolean;
  onDismiss: () => void;
  onFeedback: () => void;
}) {
  const styles = useDrawingScreenStyles();
  const { brush } = screen;
  const disabled = screen.disabled || !visible;
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      transparent
      animationType="none"
      accessibilityLabel="Drawing tools"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={styles.modalCard}>
          <Text accessibilityRole="header" style={styles.modalTitle}>
            Drawing tools
          </Text>
          <ScrollView contentContainerStyle={styles.menuContent}>
            {screen.brushControl.kind === 'menu' ? (
              <>
                <Text accessibilityRole="header" style={styles.subtitle}>
                  Brush
                </Text>
                <View style={styles.toolbar}>
                  {screen.availableBrushes.map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="radio"
                      accessibilityLabel={BRUSHES[key].label}
                      accessibilityState={{ checked: key === brush, disabled }}
                      aria-checked={key === brush}
                      disabled={disabled}
                      onPress={() => screen.setBrush(key)}
                      style={[
                        styles.action,
                        key === brush && styles.chosenBrush,
                        disabled && styles.disabled,
                      ]}
                    >
                      <Text style={styles.actionText}>{BRUSHES[key].label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {sound.settings.strokeWidthControlEnabled ? (
              <DrawingWidth brush={brush} disabled={disabled} sound={sound} />
            ) : null}
            <Text style={styles.subtitle}>{pageLabel(screen.history.drawing.pageId)}</Text>
            <View style={styles.toolbar}>
              {sound.settings.coloringBookEnabled ? (
                <Action
                  label="Coloring pages"
                  disabled={disabled}
                  onPress={() => run(() => screen.setPagePickerOpen(true))}
                />
              ) : null}
              <Action
                label="Clear"
                disabled={disabled}
                onPress={() =>
                  run(() => {
                    void screen.clear();
                  })
                }
              />
              <Action
                label="Save and clear"
                disabled={disabled}
                onPress={() =>
                  run(() => {
                    void screen.saveAndClear();
                  })
                }
              />
            </View>
            <DrawingActions
              disabled={disabled}
              save={() =>
                run(() => {
                  void screen.save();
                })
              }
              showPictures={() => run(screen.showPictures)}
              exportPicture={() =>
                run(() => {
                  void screen.exportPicture();
                })
              }
              openSettings={() => run(screen.openSettings)}
              openFeedback={() => run(onFeedback)}
            />
          </ScrollView>
          <Action label="Keep drawing" disabled={!visible} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
