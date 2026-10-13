import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RecordedDrawingSurface7 } from './drawing/RecordedDrawingSurface7';
import { DrawingAppearanceProvider } from './drawing/DrawingAppearance';
import { BRUSHES, INITIAL_RAINBOW, type Brush } from './drawing/brushes';
import { DRAWING_THEMES, DRAWING_SCALE, TOUCH_TARGET, type PaperTheme } from './drawing/theme';
import { UNADOPTED_PAPER, PAPER_HEIGHT, PAPER_WIDTH } from './drawing/paperSpace';
import { createHistory, addRecordedCohort, retainRecordedAllocation, clearDrawing, undoDrawing, type History } from './drawing/model';
import { parseRecordedDrawing7, serializeRecordedDrawing7 } from './drawing/recordedDrawing7';
import type { Drawing7 } from './drawing/recordedTypes7';
import type { PaintColor } from './drawing/palette';
import type { CompletedCohort7 } from './drawing/recordedContactCohort7';
import contract from './probeContract3224.json';

const MAX_RECEIPTS = 64;
const MAX_FAULTS = 16;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const PAPER_MARGIN_CSS = contract.paperHorizontalMarginCSS;
const PAPER_MAXIMUM_CSS = contract.paperMaximumWidthCSS;
const PAPER_TOP_MINIMUM_CSS = 96;
const PROBE_BRUSHES = ['pen', 'crayon', 'eraser'] as const;
const PROBE_COLORS = ['Red', 'Yellow', 'Blue'] as const;
function emptyDrawing7(): Drawing7 {
  return parseRecordedDrawing7({ version: 7, paper: UNADOPTED_PAPER, pageId: 'blank', rainbow: INITIAL_RAINBOW, seedCursor: 1, commands: [] });
}
function drawing7(history: History): Drawing7 {
  if (history.drawing.version !== 7) throw new Error('The recorded probe mode changed.');
  return history.drawing;
}
export function ProbeApp() {
  const owner = useRef(createHistory(emptyDrawing7()));
  const [history, setHistory] = useState(owner.current);
  const [brush, setBrush] = useState<Brush>('pen');
  const [color, setColor] = useState<PaintColor>('Red');
  const [appearance, setAppearance] = useState<PaperTheme>('light');
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(true);
  const [faults, setFaults] = useState<readonly string[]>([]);
  const committed = useRef<readonly CompletedCohort7[]>([]);
  const abandoned = useRef<readonly number[]>([]);
  const viewport = useWindowDimensions();
  const width = Math.min(PAPER_MAXIMUM_CSS, viewport.width - PAPER_MARGIN_CSS * 2);
  const top = Math.max(PAPER_TOP_MINIMUM_CSS, (viewport.height - width * PAPER_HEIGHT / PAPER_WIDTH) / 2);
  function publish(next: History) { owner.current = next;setHistory(next); }
  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setFaults(previous => [...previous, message].slice(0, MAX_FAULTS));
  }
  function commit(base: Drawing7, cohort: CompletedCohort7): Drawing7 {
    if (committed.current.length >= MAX_RECEIPTS) throw new Error('The recorded probe receipt budget is exhausted.');
    const next = addRecordedCohort(owner.current, base, cohort);
    committed.current = [...committed.current, cohort];publish(next);
    return drawing7(next);
  }
  function abandon(base: Drawing7, cursor: number) {
    if (abandoned.current.length >= MAX_RECEIPTS) throw new Error('The recorded probe receipt budget is exhausted.');
    const next = retainRecordedAllocation(owner.current, base, cursor);
    abandoned.current = [...abandoned.current, cursor];publish(next);
  }
  const drawing = drawing7(history);
  const state = { schema: contract.schema, contract, active, busy, faults, selection: { brush, color, widthChoice: 'extraThick' }, appearance,
    drawing, serializedDrawing7: serializeRecordedDrawing7(drawing), committedCohorts: committed.current, abandonedCursors: abandoned.current };
  const receipt = JSON.stringify(state);
  if (new TextEncoder().encode(receipt).byteLength > MAX_STATE_BYTES) throw new Error('The recorded probe state budget is exhausted.');
  const disabled = active || busy || faults.length > 0;
  const theme = DRAWING_THEMES[appearance];
  return <DrawingAppearanceProvider preference={appearance}><View testID="recorded-probe" style={[styles.screen, { backgroundColor: theme.paperMargin }]}>
    <View style={styles.controls}>
      {PROBE_BRUSHES.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={BRUSHES[value].label} disabled={disabled} onPress={() => setBrush(value)}><Text style={{ color: theme.textStrong }}>{BRUSHES[value].label}</Text></Pressable>)}
      {PROBE_COLORS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value + ' paint'} disabled={disabled} onPress={() => setColor(value)}><Text style={{ color: theme.textStrong }}>{value}</Text></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Clear probe drawing" disabled={disabled} onPress={() => publish(clearDrawing(owner.current, drawing.commands.length === 0))}><Text style={{ color: theme.textStrong }}>Clear</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle probe appearance" disabled={disabled} onPress={() => setAppearance(value => value === 'light' ? 'dark' : 'light')}><Text style={{ color: theme.textStrong }}>Appearance</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Undo probe drawing" disabled={disabled || history.undo.length === 0} onPress={() => publish(undoDrawing(owner.current))}><Text style={{ color: theme.textStrong }}>Undo</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Reopen probe drawing" disabled={disabled} onPress={() => publish(createHistory(parseRecordedDrawing7(JSON.parse(serializeRecordedDrawing7(drawing7(owner.current))))))}><Text style={{ color: theme.textStrong }}>Reopen</Text></Pressable>
    </View>
    <View style={{ position: 'absolute', width, left: (viewport.width - width) / 2, top }}>
      <RecordedDrawingSurface7 drawing={drawing} currentDrawing={() => drawing7(owner.current)} color={color} brush={brush} strokeWidth="extraThick" eraserWidth="extraThick" disabled={faults.length > 0}
        sound={null} onCohort={() => { throw new Error('A legacy cohort reached the recorded probe.'); }} onRecordedCohort={commit} onAbandonAllocation={abandon}
        onDrawingChange={setActive} onPreparingChange={setBusy} onError={fail} onRendererFault={fail} />
    </View>
    <pre data-testid="recorded-probe-state" style={{ display: 'none' }}>{receipt}</pre>
  </View></DrawingAppearanceProvider>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: DRAWING_SCALE.space3, padding: DRAWING_SCALE.space3, minHeight: TOUCH_TARGET },
});
