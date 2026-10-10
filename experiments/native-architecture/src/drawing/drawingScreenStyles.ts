import { StyleSheet } from 'react-native';
import { CONTROL_GAP, CONTROL_RADIUS, DRAWING_SCALE, DRAWING_THEME, TOUCH_TARGET } from './theme';

// Height-limited screens give tools their own rail so the paper can use the remaining height.
const LANDSCAPE_CONTROLS_WIDTH_PX = TOUCH_TARGET * 4;
// Enlarged controls and notices scroll independently instead of displacing the whole paper.
const PORTRAIT_CONTROLS_MAX_HEIGHT_PERCENT = '45%';
const STATUS_MAX_HEIGHT_PERCENT = '25%';

export const drawingScreenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DRAWING_THEME.paperMargin },
  content: { flex: 1, minHeight: 0, padding: DRAWING_SCALE.space2, gap: CONTROL_GAP },
  landscape: { flexDirection: 'row' },
  controls: { gap: CONTROL_GAP, padding: DRAWING_SCALE.space1 },
  topControls: { flexGrow: 0, maxHeight: PORTRAIT_CONTROLS_MAX_HEIGHT_PERCENT },
  sideControls: { width: LANDSCAPE_CONTROLS_WIDTH_PX, flexGrow: 0, flexShrink: 0 },
  workspace: { flex: 1, minWidth: 0, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: CONTROL_GAP,
  },
  title: { fontSize: DRAWING_SCALE.fontSizeXl, fontWeight: '800', color: DRAWING_THEME.brandSolid },
  subtitle: { fontSize: 16, color: DRAWING_THEME.textSoft },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CONTROL_GAP },
  action: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: DRAWING_SCALE.space3,
    paddingVertical: DRAWING_SCALE.space2,
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
    flexDirection: 'row',
    gap: CONTROL_GAP,
    alignItems: 'center',
    maxWidth: 1024,
  },
  feedback: { flexGrow: 0, maxHeight: STATUS_MAX_HEIGHT_PERCENT },
  feedbackContent: {
    paddingHorizontal: DRAWING_SCALE.space3,
    paddingBottom: DRAWING_SCALE.space2,
    gap: CONTROL_GAP,
  },
  menuContent: { gap: DRAWING_SCALE.space4, paddingBottom: DRAWING_SCALE.space2 },
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
