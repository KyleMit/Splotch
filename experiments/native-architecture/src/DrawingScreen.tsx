import { useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PaintColors } from './drawing/PaintColors';
import { ColorPicker } from './drawing/ColorPicker';
import { ColoringPagePicker } from './ColoringPagePicker';
import { COLORING_PAGES } from './drawing/pages';
import { DrawingSurface, type DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { createPaperScroll } from './drawing/paperGeometry';
import { useDrawingScreen } from './useDrawingScreen';
import type { SavedPicture } from './platform/drawingFiles';
import { BRUSHES, BRUSH_ORDER, type Brush } from './drawing/brushes';
import type { History } from './drawing/model';
import { CONTROL_GAP, CONTROL_RADIUS, DRAWING_THEME, TOUCH_TARGET } from './drawing/theme';
import { useDrawingSound } from './useDrawingSound';
import { SoundSettings } from './settings/SoundSettingsSheet';
import { StrokeWidthSelector } from './drawing/StrokeWidthSelector';
import { useColorPickerFocus } from './useColorPickerFocus';

const SCROLL_GEOMETRY_THROTTLE_MS = 16;

function Action({
  label,
  disabled,
  onPress,
  primary = false,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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

function DrawingScroll({
  children,
  drawing,
  surface,
}: {
  children: ReactNode;
  drawing: boolean;
  surface: RefObject<DrawingSurfaceHandle | null>;
}) {
  const scrollGeometry = useRef(
    createPaperScroll(() => surface.current?.refreshGeometry())
  ).current;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      scrollEnabled={!drawing}
      onLayout={() => surface.current?.refreshGeometry()}
      onScroll={({ nativeEvent }) => scrollGeometry(nativeEvent.contentOffset)}
      onContentSizeChange={() => surface.current?.refreshGeometry()}
      scrollEventThrottle={SCROLL_GEOMETRY_THROTTLE_MS}
    >
      {children}
    </ScrollView>
  );
}

function useIdleMessage(message: string, drawing: boolean) {
  const [settled, setSettled] = useState(message);
  // Changing status layout invalidates the paper frame owned by the active contacts.
  if (!drawing && settled !== message) setSettled(message);
  return drawing ? settled : message;
}

export function DrawingScreen() {
  const screen = useDrawingScreen();
  const {
    history,
    currentDrawing,
    clear,
    undo,
    recovery,
    brush,
    setBrush,
    drawing,
    busy,
    notice,
    pictures,
    surface,
    pagePickerOpen,
    setPagePickerOpen,
    settingsOpen,
    colorPickerOpen,
    openColorPicker,
    openSettings,
    disabled,
    save,
    exportPicture,
    showPictures,
  } = screen;
  const sound = useDrawingSound();
  const paintsDisabled = disabled || sound.settings.status !== 'ready';
  const focusReturn = useColorPickerFocus({
    pickerOpen: colorPickerOpen,
    closePicker: screen.closeColorPicker,
    disabled: paintsDisabled,
    blocked: disabled || pictures !== null,
  });
  const color = sound.settings.selectedColor;
  const visibleNotice = useIdleMessage(notice, drawing);
  const visibleSoundMessage = useIdleMessage(sound.settings.message || sound.audioMessage, drawing);
  return (
    <SafeAreaView
      style={styles.screen}
      onLayout={() => surface.current?.refreshGeometry()}
      onFocus={focusReturn.cancel}
      onPointerDown={focusReturn.cancel}
      onTouchStart={focusReturn.cancel}
    >
      <DrawingScroll drawing={drawing} surface={surface}>
        <View style={styles.heading}>
          <Text style={styles.title}>Splotch</Text>
          <Text style={styles.subtitle}>Make something colorful.</Text>
        </View>
        <PaintColors
          color={color}
          customColors={sound.settings.customColors}
          disabled={paintsDisabled}
          openerRef={focusReturn.opener}
          onExplore={openColorPicker}
          onChange={(next) => {
            void sound.owner?.settings.setColor(next);
          }}
        />
        <DrawingTools
          history={history}
          brush={brush}
          disabled={disabled}
          onBrush={setBrush}
          onPages={() => setPagePickerOpen(true)}
          onUndo={undo}
          onClear={() => {
            void clear();
          }}
        />
        <DrawingWidth brush={brush} disabled={disabled} sound={sound} />
        <Text style={styles.subtitle}>{COLORING_PAGES[history.drawing.pageId].label}</Text>
        <DrawingSurface
          key={recovery.generation}
          ref={surface}
          drawing={history.drawing}
          currentDrawing={currentDrawing}
          color={color}
          brush={brush}
          strokeWidth={sound.settings.strokeWidth}
          eraserWidth={sound.settings.eraserWidth}
          disabled={
            busy ||
            pictures !== null ||
            pagePickerOpen ||
            settingsOpen ||
            colorPickerOpen ||
            sound.settings.status === 'loading'
          }
          sound={sound.owner?.contacts ?? null}
          {...recovery.callbacks}
        />
        <DrawingActions
          disabled={disabled}
          save={save}
          showPictures={showPictures}
          exportPicture={exportPicture}
          openSettings={openSettings}
        />
        {recovery.failed ? (
          <Action
            label="Retry drawing"
            disabled={recovery.retryDisabled}
            onPress={recovery.retry}
          />
        ) : null}
        <View style={styles.status}>
          {busy && !recovery.failed ? <ActivityIndicator color={DRAWING_THEME.brandSolid} /> : null}
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {visibleNotice}
          </Text>
        </View>
        {visibleSoundMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {visibleSoundMessage}
          </Text>
        ) : null}
      </DrawingScroll>
      <DrawingSheets screen={screen} sound={sound} onCloseColors={focusReturn.close} />
    </SafeAreaView>
  );
}

function DrawingSheets({
  screen,
  sound,
  onCloseColors,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  onCloseColors: () => void;
}) {
  const {
    history,
    colorPickerOpen,
    pagePickerOpen,
    choosePage,
    setPagePickerOpen,
    settingsOpen,
    closeSettings,
    pictures,
    busy,
    notice,
    openPicture,
    setPictures,
  } = screen;
  const color = sound.settings.selectedColor;
  return (
    <>
      {colorPickerOpen ? (
        <ColorPicker
          selected={color}
          onClose={onCloseColors}
          onChoose={(next) => {
            void sound.owner?.settings.setColor(next);
            onCloseColors();
          }}
        />
      ) : null}
      {pagePickerOpen ? (
        <ColoringPagePicker
          selected={history.drawing.pageId}
          onChoose={choosePage}
          onClose={() => setPagePickerOpen(false)}
        />
      ) : null}
      {settingsOpen ? (
        <SoundSettings
          state={sound.settings}
          audioMessage={sound.audioMessage}
          onChange={(enabled) => {
            void sound.owner?.settings.setEnabled(enabled);
          }}
          onRetrySave={() => {
            void sound.owner?.settings.retrySave();
          }}
          onClose={closeSettings}
        />
      ) : null}
      <SavedPictures
        pictures={pictures}
        busy={busy}
        notice={notice}
        onOpen={openPicture}
        onClose={() => setPictures(null)}
      />
    </>
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
}: Pick<
  ReturnType<typeof useDrawingScreen>,
  'disabled' | 'save' | 'showPictures' | 'exportPicture' | 'openSettings'
>) {
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

function DrawingTools({
  history,
  brush,
  disabled,
  onBrush,
  onPages,
  onUndo,
  onClear,
}: {
  history: History;
  brush: Brush;
  disabled: boolean;
  onBrush: (brush: Brush) => void;
  onPages: () => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.toolbar}>
      <Action label="Coloring pages" disabled={disabled} onPress={onPages} />
      {BRUSH_ORDER.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={BRUSHES[key].label}
          accessibilityState={{ selected: key === brush, disabled }}
          disabled={disabled}
          onPress={() => onBrush(key)}
          style={[styles.action, key === brush && styles.chosenBrush]}
        >
          <Text style={styles.actionText}>{BRUSHES[key].label}</Text>
        </Pressable>
      ))}
      <Action label="Undo" disabled={disabled || history.undo.length === 0} onPress={onUndo} />
      <Action label="Clear" disabled={disabled} onPress={onClear} />
    </View>
  );
}

function SavedPictures({
  pictures,
  busy,
  notice,
  onOpen,
  onClose,
}: {
  pictures: SavedPicture[] | null;
  busy: boolean;
  notice: string;
  onOpen: (picture: SavedPicture) => Promise<void>;
  onClose: () => void;
}) {
  if (pictures === null) return null;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Your pictures</Text>
          {notice ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.notice, styles.modalNotice]}
            >
              {notice}
            </Text>
          ) : null}
          <ScrollView style={styles.pictureList}>
            {pictures?.length ? (
              pictures.map((picture) => (
                <Pressable
                  key={picture.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open picture from ${picture.name}`}
                  disabled={busy}
                  onPress={() => {
                    void onOpen(picture);
                  }}
                  style={styles.savedPicture}
                >
                  <Text style={styles.actionText}>{picture.name}</Text>
                  <Text style={styles.subtitle}>Tap to open</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.notice}>Save a picture to find it here.</Text>
            )}
          </ScrollView>
          <Action label="Close" disabled={busy} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DRAWING_THEME.paperMargin },
  content: { padding: 16, gap: 16, alignItems: 'center' },
  heading: { width: '100%', maxWidth: 1024, gap: 4 },
  title: { fontSize: 32, fontWeight: '800', color: DRAWING_THEME.brandSolid },
  subtitle: { fontSize: 16, color: DRAWING_THEME.textSoft },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CONTROL_GAP },
  action: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 18,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
    borderColor: DRAWING_THEME.borderWarm,
    backgroundColor: DRAWING_THEME.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 16, fontWeight: '600', color: DRAWING_THEME.textStrong },
  primary: { backgroundColor: DRAWING_THEME.brandSolid, borderColor: DRAWING_THEME.brandSolid },
  primaryText: { color: DRAWING_THEME.surface },
  chosenBrush: {
    backgroundColor: DRAWING_THEME.brandWash,
    borderColor: DRAWING_THEME.brandSolid,
    borderWidth: 2,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  status: {
    minHeight: 32,
    flexDirection: 'row',
    gap: CONTROL_GAP,
    alignItems: 'center',
    maxWidth: 1024,
  },
  notice: { fontSize: 15, color: DRAWING_THEME.text, flexShrink: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    padding: 24,
    borderRadius: 16,
    backgroundColor: DRAWING_THEME.paper,
    gap: 16,
  },
  modalTitle: { fontSize: 24, fontWeight: '700', color: DRAWING_THEME.textStrong },
  modalNotice: { flexShrink: 0, alignSelf: 'stretch' },
  pictureList: { flexGrow: 0, flexShrink: 1 },
  savedPicture: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: DRAWING_THEME.borderWarm,
    gap: 4,
  },
});
