import { useState, type PointerEvent, type ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { motion } from './tokens.css';
import { useReduceMotion } from '../drawing/useReduceMotion';
import {
  SWITCH_SLIDE_PX,
  SwitchThumbFace,
  SwitchTrack,
  switchStyles,
  type ToggleSwitchProps,
} from './toggleSwitchFace';

const styles = css.create({
  slide: {
    transform: 'translateX(0)',
    transitionProperty: 'transform',
    transitionDuration: motion.durationBase,
    transitionTimingFunction: 'ease',
  },
  // A dynamic style: StyleX evaluates only this module's own constants statically.
  slid: (offset: number) => ({ transform: `translateX(${offset}px)` }),
  // The thumb is where the state is, so under reduced motion it stays and stops sliding there.
  still: { transitionDuration: '0s' },
});

// The shipping ToggleSwitch.svelte on the web: a real <button role="switch"> whose thumb slides
// by a CSS transition, described by the row's help line.
export function RsdToggleSwitch({
  id,
  label,
  checked,
  onToggle,
  description,
  disabled = false,
  thumbIcon,
}: ToggleSwitchProps) {
  const reduced = useReduceMotion();
  const [hovered, setHovered] = useState(false);
  return (
    <html.button
      id={id}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-describedby={description?.id}
      aria-disabled={disabled}
      disabled={disabled}
      style={[switchStyles.hitArea, disabled && switchStyles.inert]}
      onClick={() => onToggle(!checked)}
      onPointerEnter={(event: PointerEvent) => setHovered(event.pointerType === 'mouse')}
      onPointerLeave={() => setHovered(false)}
    >
      <SwitchTrack checked={checked} hovered={hovered} />
      <html.div style={switchStyles.thumbSlot}>
        <html.div
          data-testid="toggle-switch-slide"
          style={[styles.slide, checked && styles.slid(SWITCH_SLIDE_PX), reduced && styles.still]}
        >
          <SwitchThumbFace thumbIcon={thumbIcon} />
        </html.div>
      </html.div>
    </html.button>
  );
}

// The row's icon and label, a <label for> the switch as in shipping, so a click on either
// toggles it and the visible text stays the switch's label.
export function RsdSwitchLabel({
  id,
  disabled,
  children,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <html.label for={id} style={[switchStyles.label, disabled && switchStyles.labelInert]}>
      {children}
    </html.label>
  );
}
