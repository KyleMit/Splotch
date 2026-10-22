import type { ImageSourcePropType } from 'react-native';
import type { PaperTheme } from '../drawing/theme';
import type { AiStyle } from './contract';
import magicalLight from '../../assets/ai-styles/magical.light.webp';
import magicalDark from '../../assets/ai-styles/magical.dark.webp';
import crayonLight from '../../assets/ai-styles/crayon.light.webp';
import crayonDark from '../../assets/ai-styles/crayon.dark.webp';
import watercolorLight from '../../assets/ai-styles/watercolor.light.webp';
import watercolorDark from '../../assets/ai-styles/watercolor.dark.webp';
import paperLight from '../../assets/ai-styles/paper.light.webp';
import paperDark from '../../assets/ai-styles/paper.dark.webp';
import feltLight from '../../assets/ai-styles/felt.light.webp';
import feltDark from '../../assets/ai-styles/felt.dark.webp';
import stickerLight from '../../assets/ai-styles/sticker.light.webp';
import stickerDark from '../../assets/ai-styles/sticker.dark.webp';
import cartoonLight from '../../assets/ai-styles/cartoon.light.webp';
import cartoonDark from '../../assets/ai-styles/cartoon.dark.webp';
import clayLight from '../../assets/ai-styles/clay.light.webp';
import clayDark from '../../assets/ai-styles/clay.dark.webp';

const previews = {
  Magical: { light: magicalLight, dark: magicalDark },
  Crayon: { light: crayonLight, dark: crayonDark },
  Watercolor: { light: watercolorLight, dark: watercolorDark },
  Paper: { light: paperLight, dark: paperDark },
  Felt: { light: feltLight, dark: feltDark },
  Sticker: { light: stickerLight, dark: stickerDark },
  Cartoon: { light: cartoonLight, dark: cartoonDark },
  Clay: { light: clayLight, dark: clayDark },
} satisfies Record<
  AiStyle,
  Record<PaperTheme, number | string | { uri: string; width: number; height: number }>
>;

export function aiStylePreviewSource(style: AiStyle, theme: PaperTheme): ImageSourcePropType {
  const source = previews[style][theme];
  return typeof source === 'string' ? { uri: source } : source;
}
