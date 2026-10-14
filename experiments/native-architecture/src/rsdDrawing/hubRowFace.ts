import { css } from 'react-strict-dom';
import { fonts } from './tokens.css';

// Shipping's HubList rows are <button>s that never take `font-family: inherit`, so their text is
// set in the browser's control face rather than the app font. `revert` hands the row back to that
// face over strict.css's inherit rule, and the title keeps its own weight.
export const hubRowFace = css.create({
  row: { fontFamily: 'revert' },
  title: { fontWeight: fonts.semiboldWeight },
});
