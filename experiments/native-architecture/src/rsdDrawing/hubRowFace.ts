import { css } from 'react-strict-dom';
import { fonts } from './tokens.css';

// The web keeps the app font on the hub rows. Shipping's rows draw in the browser's control face,
// but strict.css hands every form control the page font, and that unlayered rule outranks any
// layered StyleX style that would revert the row to the browser's face.
export const hubRowFace = css.create({
  row: {},
  title: { fontFamily: fonts.semiboldFamily, fontWeight: fonts.semiboldWeight },
});
