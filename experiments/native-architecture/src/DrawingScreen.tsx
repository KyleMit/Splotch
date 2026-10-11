import { useState, type ReactNode, type RefObject } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { PaintColors } from './drawing/PaintColors';
import { usePaintSelectionFocus } from './drawing/usePaintSelectionFocus';
import { ColorPicker } from './drawing/ColorPicker';
import { ColoringPagePicker } from './ColoringPagePicker';
import { DrawingSurface, type DrawingSurfaceHandle } from './drawing/DrawingSurface';
import { useDrawingScreen } from './useDrawingScreen';
import { useDrawingMenu } from './useDrawingMenu';
import type { SavedPicture } from './platform/drawingFiles';
import { BRUSHES } from './drawing/brushes';
import { PAPER_HEIGHT, PAPER_WIDTH } from './drawing/model';
import { DrawingStatus } from './DrawingStatus';
import { drawingScreenStyles as styles } from './drawing/drawingScreenStyles';
import { Action, DrawingMenu } from './DrawingControls';
import { useDrawingSound } from './useDrawingSound';
import { SoundSettings } from './settings/SoundSettingsSheet';
import { useColorPickerFocus } from './useColorPickerFocus';

function PaperWorkspace({
  children,
  surface,
}: {
  children: ReactNode;
  surface: RefObject<DrawingSurfaceHandle | null>;
}) {
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const paperWidth = Math.min(
    space.width,
    (space.height * PAPER_WIDTH) / PAPER_HEIGHT,
    PAPER_WIDTH
  );
  return (
    <View
      style={styles.workspace}
      onLayout={({ nativeEvent }) => {
        const { width, height } = nativeEvent.layout;
        setSpace((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height }
        );
        surface.current?.refreshGeometry();
      }}
    >
      <View style={{ width: paperWidth }}>{children}</View>
    </View>
  );
}

export function DrawingScreen() {
  const screen = useDrawingScreen();
  const menu = useDrawingMenu(screen);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const {
    history,
    undo,
    brush,
    drawing,
    pictures,
    surface,
    colorPickerOpen,
    openColorPicker,
    disabled,
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
  const paintFocus = usePaintSelectionFocus({
    color,
    disabled: paintsDisabled || menu.open,
    blocked: disabled || menu.open || pictures !== null || colorPickerOpen,
  });
  const menuFocus = useColorPickerFocus({
    pickerOpen: menu.open || screen.settingsOpen,
    closePicker: () => {
      if (screen.settingsOpen) setSettingsClosing(true);
      else menu.close();
    },
    disabled,
    blocked: disabled || pictures !== null,
  });
  return (
    <SafeAreaView
      style={styles.screen}
      onLayout={() => surface.current?.refreshGeometry()}
      onFocus={() => {
        paintFocus.cancel();
        focusReturn.cancel();
        menuFocus.cancel();
      }}
      onPointerDown={() => {
        paintFocus.cancel();
        focusReturn.cancel();
        menuFocus.cancel();
      }}
      onTouchStart={() => {
        paintFocus.cancel();
        focusReturn.cancel();
        menuFocus.cancel();
      }}
    >
      <View
        accessibilityElementsHidden={menu.open}
        importantForAccessibility={menu.open ? 'no-hide-descendants' : 'auto'}
        style={[styles.content, landscape && styles.landscape]}
      >
        <ScrollView
          style={landscape ? styles.sideControls : styles.topControls}
          contentContainerStyle={styles.controls}
          scrollEnabled={!drawing}
        >
          <View style={styles.heading}>
            <Text style={styles.title}>Splotch</Text>
            <Action
              label="Undo"
              disabled={disabled || menu.open || history.undo.length === 0}
              onPress={undo}
            />
            <Action
              label={`${BRUSHES[brush].label} ▾`}
              accessibilityLabel={`Drawing tools. ${BRUSHES[brush].label} selected.`}
              openerRef={menuFocus.opener}
              disabled={disabled || menu.open}
              onPress={menu.show}
            />
          </View>
          <PaintColors
            color={color}
            customColors={sound.settings.customColors}
            disabled={paintsDisabled || menu.open}
            openerRef={focusReturn.opener}
            onExplore={openColorPicker}
            onChange={(next, target) => {
              void paintFocus.choose(next, target, () => sound.owner?.settings.setColor(next));
            }}
          />
        </ScrollView>
        <DrawingPaper screen={screen} sound={sound} menuOpen={menu.open} />
      </View>
      <DrawingFeedback screen={screen} sound={sound} menuOpen={menu.open} />
      {menu.open ? (
        <DrawingMenu
          screen={screen}
          sound={sound}
          visible={menu.visible}
          onDismiss={menu.dismissed}
          run={menu.run}
          onClose={menuFocus.close}
        />
      ) : null}
      <DrawingSheets
        screen={screen}
        sound={sound}
        onCloseColors={focusReturn.close}
        settingsClosing={settingsClosing}
        onCloseSettings={menuFocus.close}
        onSettingsDismissed={() => {
          screen.closeSettings();
          setSettingsClosing(false);
        }}
      />
    </SafeAreaView>
  );
}

function DrawingPaper({
  screen,
  sound,
  menuOpen,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menuOpen: boolean;
}) {
  const {
    surface,
    recovery,
    history,
    currentDrawing,
    brush,
    busy,
    pictures,
    pagePickerOpen,
    settingsOpen,
    colorPickerOpen,
  } = screen;
  const color = sound.settings.selectedColor;
  return (
    <PaperWorkspace surface={surface}>
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
          menuOpen ||
          sound.settings.status === 'loading'
        }
        sound={sound.owner?.contacts ?? null}
        {...recovery.callbacks}
      />
    </PaperWorkspace>
  );
}

function DrawingFeedback({
  screen,
  sound,
  menuOpen,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  menuOpen: boolean;
}) {
  const { recovery } = screen;
  return (
    <ScrollView
      accessibilityElementsHidden={menuOpen}
      importantForAccessibility={menuOpen ? 'no-hide-descendants' : 'auto'}
      style={styles.feedback}
      contentContainerStyle={styles.feedbackContent}
    >
      {recovery.failed ? (
        <Action label="Retry drawing" disabled={recovery.retryDisabled} onPress={recovery.retry} />
      ) : null}
      <DrawingStatus
        blocked={menuOpen || screen.colorPickerOpen}
        screen={screen}
        soundMessage={sound.settings.message || sound.audioMessage}
      />
    </ScrollView>
  );
}

function DrawingSheets({
  screen,
  sound,
  onCloseColors,
  settingsClosing,
  onCloseSettings,
  onSettingsDismissed,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  onCloseColors: () => void;
  settingsClosing: boolean;
  onCloseSettings: () => void;
  onSettingsDismissed: () => void;
}) {
  const {
    history,
    colorPickerOpen,
    pagePickerOpen,
    choosePage,
    setPagePickerOpen,
    settingsOpen,
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
          visible={!settingsClosing}
          onDismiss={onSettingsDismissed}
          state={sound.settings}
          audioMessage={sound.audioMessage}
          onChange={(enabled) => {
            void sound.owner?.settings.setEnabled(enabled);
          }}
          onRetrySave={() => {
            void sound.owner?.settings.retrySave();
          }}
          onClose={onCloseSettings}
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
