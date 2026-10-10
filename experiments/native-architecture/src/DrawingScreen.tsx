import { useRef, type ReactNode, type RefObject } from 'react';
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
import { paletteHex, type PaletteLabel } from './drawing/palette';
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

const SCROLL_GEOMETRY_THROTTLE_MS = 16;

const COLORS: readonly PaletteLabel[] = [
  'Purple',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Red',
  'Black',
];

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

export function DrawingScreen() {
  const {
    history,
    currentDrawing,
    clear,
    undo,
    recovery,
    color,
    setColor,
    brush,
    setBrush,
    drawing,
    busy,
    notice,
    pictures,
    setPictures,
    surface,
    pagePickerOpen,
    setPagePickerOpen,
    settingsOpen,
    openSettings,
    closeSettings,
    choosePage,
    disabled,
    save,
    exportPicture,
    showPictures,
    openPicture,
  } = useDrawingScreen();
  const sound = useDrawingSound();
  return (
    <SafeAreaView style={styles.screen} onLayout={() => surface.current?.refreshGeometry()}>
      <DrawingScroll drawing={drawing} surface={surface}>
        <View style={styles.heading}>
          <Text style={styles.title}>Splotch</Text>
          <Text style={styles.subtitle}>Make something colorful.</Text>
        </View>
        <PaintColors color={color} disabled={disabled} onChange={setColor} />
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
        <Text style={styles.subtitle}>{COLORING_PAGES[history.drawing.pageId].label}</Text>
        <DrawingSurface
          key={recovery.generation}
          ref={surface}
          drawing={history.drawing}
          currentDrawing={currentDrawing}
          color={color}
          brush={brush}
          disabled={busy || pictures !== null || pagePickerOpen || settingsOpen}
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
            {notice}
          </Text>
        </View>
        {sound.settings.message || sound.audioMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {sound.settings.message || sound.audioMessage}
          </Text>
        ) : null}
      </DrawingScroll>
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
    </SafeAreaView>
  );
}

function PaintColors({
  color,
  disabled,
  onChange,
}: {
  color: PaletteLabel;
  disabled: boolean;
  onChange: (color: PaletteLabel) => void;
}) {
  return (
    <View style={styles.palette}>
      {COLORS.map((label) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={`${label} paint`}
          accessibilityState={{ selected: label === color, disabled }}
          disabled={disabled}
          onPress={() => onChange(label)}
          style={[
            styles.swatch,
            { backgroundColor: paletteHex(label) },
            label === color && styles.selectedSwatch,
          ]}
        >
          {label === color ? <Text style={styles.swatchMark}>✓</Text> : null}
        </Pressable>
      ))}
    </View>
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
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CONTROL_GAP },
  swatch: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSwatch: { borderColor: DRAWING_THEME.textStrong },
  swatchMark: {
    fontSize: 28,
    fontWeight: '800',
    color: DRAWING_THEME.surface,
    textShadowColor: DRAWING_THEME.textStrong,
    textShadowRadius: 2,
  },
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
