import { css } from 'react-strict-dom';
import { motion } from './tokens.css';

// A toggle option carries its pressed state as aria-pressed, the shipping toggle chip's state.
export function pressedState(pressed: boolean) {
  return { 'aria-pressed': pressed } as const;
}

// A radio group is one tab stop, as shipping's: the roving option takes Tab, and the arrow keys
// move selection and focus together.
export function optionTabIndex({ rovingStop }: { rovingStop: boolean; disabled: boolean }) {
  return rovingStop ? 0 : -1;
}

// The shipping options fade their ink and fill over --duration-fast as the selection moves.
export const optionFades = css.create({
  segment: {
    transitionProperty: 'color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
  chip: {
    transitionProperty: 'background-color, color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
  underline: {
    transitionProperty: 'color, border-color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
});
