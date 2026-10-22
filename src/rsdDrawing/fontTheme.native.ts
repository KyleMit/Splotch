import { css } from 'react-strict-dom';
import { fonts } from './tokens.css';
import { NATIVE_RSD_FONTS } from '../platform/nativeFontFamilies';

export const fontTheme = css.createTheme(fonts, NATIVE_RSD_FONTS);
