import { DrawingModal as Modal } from '../platform/DrawingModal';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Action } from '../DrawingControls';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import type { SavedPicture } from '../platform/drawingFiles';
import { useModalAnimation } from './useModalAnimation';
import { useDrawingScreenStyles } from './drawingScreenStyles';

export function SavedPictures({
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
  const animationType = useModalAnimation();
  const styles = useDrawingScreenStyles();
  if (pictures === null) return null;
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible
      transparent
      animationType={animationType}
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <NativeFrame variant="overlay">
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
      </NativeFrame>
    </Modal>
  );
}
