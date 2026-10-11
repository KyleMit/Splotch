import type { RefObject } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import type { useDrawingScreen } from './useDrawingScreen';
import type { useDrawingSound } from './useDrawingSound';
import { BRUSHES, BRUSH_ORDER, type Brush } from './drawing/brushes';
import { pageLabel } from './drawing/pages';
import { StrokeWidthSelector } from './drawing/StrokeWidthSelector';
import { drawingScreenStyles as styles } from './drawing/drawingScreenStyles';

export function Action({
  label,
  disabled,
  onPress,
  primary = false,
  accessibilityLabel = label,
  openerRef,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  primary?: boolean;
  accessibilityLabel?: string;
  openerRef?: RefObject<View | null>;
}) {
  return (
    <Pressable
      ref={openerRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.primary,
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
}: {
  disabled: boolean;
  save: () => void;
  showPictures: () => void;
  exportPicture: () => void;
  openSettings: () => void;
}) {
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
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  run: (action: () => void) => void;
  onClose: () => void;
  visible: boolean;
  onDismiss: () => void;
}) {
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
            <Text accessibilityRole="header" style={styles.subtitle}>
              Brush
            </Text>
            <View style={styles.toolbar}>
              {BRUSH_ORDER.map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={BRUSHES[key].label}
                  accessibilityState={{ selected: key === brush, disabled }}
                  aria-pressed={key === brush}
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
            <DrawingWidth brush={brush} disabled={disabled} sound={sound} />
            <Text style={styles.subtitle}>{pageLabel(screen.history.drawing.pageId)}</Text>
            <View style={styles.toolbar}>
              <Action
                label="Coloring pages"
                disabled={disabled}
                onPress={() => run(() => screen.setPagePickerOpen(true))}
              />
              <Action
                label="Clear"
                disabled={disabled}
                onPress={() =>
                  run(() => {
                    void screen.clear();
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
            />
          </ScrollView>
          <Action label="Keep drawing" disabled={!visible} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
