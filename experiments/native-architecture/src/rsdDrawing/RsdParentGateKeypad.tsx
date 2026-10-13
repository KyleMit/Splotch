import { css, html } from 'react-strict-dom';
import { colors, dimensions, fonts, motion } from './tokens.css';
import { RsdIcon } from './RsdIcon';
import type { GateSizeClass } from './modalGeometry';
import { PARENT_GATE_KEYPAD_METRICS } from '../parentCenter/parentGateMetrics';
import { PARENT_GATE_KEYPAD_KEYS, type ParentGateKey } from '../parentCenter/parentGate';

const KEY_PRESSED_SCALE = 0.92;
const KEYS_PER_ROW = 3;

export const PARENT_GATE_KEY_ICONS = { delete: 'backspace', submit: 'check' } as const;
export const PARENT_GATE_KEY_LABELS = { delete: 'Delete', submit: 'Check answer' } as const;

const KEY_ROWS = Array.from({ length: PARENT_GATE_KEYPAD_KEYS.length / KEYS_PER_ROW }, (_, row) =>
  PARENT_GATE_KEYPAD_KEYS.slice(row * KEYS_PER_ROW, (row + 1) * KEYS_PER_ROW)
);

const styles = css.create({
  keypad: (gap: number) => ({ display: 'flex', flexDirection: 'column', gap }),
  width: (width: number) => ({ width, flexShrink: 0 }),
  row: (gap: number) => ({ display: 'flex', flexDirection: 'row', gap }),
  key: (height: number) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    height,
    padding: 0,
    borderWidth: 0,
    borderRadius: dimensions.radiusMd,
    backgroundColor: { default: colors.surface2, ':hover': colors.brandWash },
    color: colors.textStrong,
    fontFamily: fonts.boldFamily,
    fontWeight: fonts.boldWeight,
    cursor: 'pointer',
    transform: { default: 'scale(1)', ':active': `scale(${KEY_PRESSED_SCALE})` },
    transitionProperty: 'transform',
    transitionDuration: motion.durationFast,
  }),
  lg: { fontSize: dimensions.fontSizeLg },
  xl: { fontSize: dimensions.fontSizeXl },
  locked: { opacity: dimensions.disabledOpacity, cursor: 'default', transform: 'scale(1)' },
});

/**
 * The Grown-Ups Only keypad: ten digits, Delete, and the check key. Keys stay pressable and
 * focusable through a lockout (aria-disabled, never disabled) so focus never falls out of the
 * dialog; the gate ignores what it is handed until the pause ends.
 */
export function RsdParentGateKeypad({
  size,
  locked,
  onPress,
}: {
  size: GateSizeClass;
  locked: boolean;
  onPress: (key: ParentGateKey) => void;
}) {
  const metrics = PARENT_GATE_KEYPAD_METRICS[size];
  return (
    <html.div
      data-testid="gate-keypad"
      style={[styles.keypad(metrics.gap), metrics.width !== null && styles.width(metrics.width)]}
    >
      {KEY_ROWS.map((keys) => (
        <html.div key={keys.join()} style={styles.row(metrics.gap)}>
          {keys.map((key) => (
            <html.button
              key={key}
              data-key={key}
              aria-label={typeof key === 'number' ? undefined : PARENT_GATE_KEY_LABELS[key]}
              aria-disabled={locked}
              style={[
                styles.key(metrics.keyHeight),
                metrics.digits === 'xl' ? styles.xl : styles.lg,
                locked && styles.locked,
              ]}
              onClick={() => onPress(key)}
            >
              {typeof key === 'number' ? (
                String(key)
              ) : (
                <RsdIcon
                  name={PARENT_GATE_KEY_ICONS[key]}
                  size={metrics.icon}
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
