import { css } from 'react-strict-dom';
import { motion } from './tokens.css';

// The shipping row fades its wash and ink over --duration-fast as the reading position moves.
export const sidebarRowFade = css.create({
  row: {
    transitionProperty: 'background-color, color',
    transitionDuration: motion.durationFast,
    transitionTimingFunction: 'ease',
  },
});
