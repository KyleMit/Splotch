// A flyout-open tile greys through CSS grayscale(1), which React Native's iOS renderer drops, so
// the native app paints the grey into the icon markup and the badge colour itself.
export { grayscale as greyedColor, grayscaleMarkup as greyedMarkup } from './colorMix';
