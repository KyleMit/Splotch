import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';
import { RsdIcon } from './RsdIcon';
import { PARENT_GATE_KEYPAD_KEYS, type ParentGateKey } from '../parentCenter/parentGate';

// The shipping keypad's phone-size key height and glyph size (ParentalGateKeypad.svelte);
// rsd-native-parent-center.test.mjs fails when either side changes alone.
export const PARENT_GATE_KEY_HEIGHT_PX = 46;
export const PARENT_GATE_KEY_ICON_PX = 22;
const KEYS_PER_ROW = 3;

export const PARENT_GATE_KEY_ICONS = { delete: 'backspace', submit: 'check' } as const;
export const PARENT_GATE_KEY_LABELS = { delete: 'Delete', submit: 'Check answer' } as const;

const KEY_ROWS = Array.from({ length: PARENT_GATE_KEYPAD_KEYS.length / KEYS_PER_ROW }, (_, row) =>
  PARENT_GATE_KEYPAD_KEYS.slice(row * KEYS_PER_ROW, (row + 1) * KEYS_PER_ROW)
);

const styles = css.create({
  keypad: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  row: { display: 'flex', flexDirection: 'row', gap: dimensions.space2 },
  key: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    height: PARENT_GATE_KEY_HEIGHT_PX,
    padding: 0,
    borderWidth: 0,
    borderRadius: dimensions.radiusMd,
    backgroundColor: colors.surface2,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
    fontWeight: dimensions.fontWeightBold,
  },
  locked: { opacity: dimensions.disabledOpacity },
});

/**
 * The Grown-Ups Only keypad: ten digits, Delete, and the check key. Keys stay pressable and
 * focusable through a lockout (aria-disabled, never disabled) so focus never falls out of the
 * dialog; the gate ignores what it is handed until the pause ends.
 */
export function RsdParentGateKeypad({
  locked,
  onPress,
}: {
  locked: boolean;
  onPress: (key: ParentGateKey) => void;
}) {
  return (
    <html.div style={styles.keypad}>
      {KEY_ROWS.map((keys) => (
        <html.div key={keys.join()} style={styles.row}>
          {keys.map((key) => (
            <html.button
              key={key}
              data-key={key}
              aria-label={typeof key === 'number' ? undefined : PARENT_GATE_KEY_LABELS[key]}
              aria-disabled={locked}
              style={[styles.key, locked && styles.locked]}
              onClick={() => onPress(key)}
            >
              {typeof key === 'number' ? (
                String(key)
              ) : (
                <RsdIcon
                  name={PARENT_GATE_KEY_ICONS[key]}
                  size={PARENT_GATE_KEY_ICON_PX}
                  ink={undefined}
                  muted={false}
                />
              )}
            </html.button>
          ))}
        </html.div>
      ))}
    </html.div>
  );
}
