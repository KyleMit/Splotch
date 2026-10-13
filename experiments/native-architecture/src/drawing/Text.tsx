import type { ComponentPropsWithRef } from 'react';
import {
  Text as BaseText,
  TextInput as BaseTextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { shippingTextFont } from '../platform/shippingTextFont';

// React Native's Text and TextInput, set in the app font for their weight. Components
// import these instead of react-native's; native-shipping-font.test.mjs fails on a
// direct import.
type TextStyles = StyleProp<TextStyle> | readonly TextStyles[];

function isStyleList(style: TextStyles): style is readonly TextStyles[] {
  return Array.isArray(style);
}

// The weight React Native applies: the last one set in the (nested) style list.
function fontWeightOf(style: TextStyles): TextStyle['fontWeight'] {
  if (!isStyleList(style)) return style && typeof style === 'object' ? style.fontWeight : undefined;
  for (let index = style.length - 1; index >= 0; index--) {
    const weight = fontWeightOf(style[index]);
    if (weight !== undefined) return weight;
  }
  return undefined;
}

export function Text({ style, ...props }: ComponentPropsWithRef<typeof BaseText>) {
  return <BaseText {...props} style={[style, shippingTextFont(fontWeightOf(style))]} />;
}

export function TextInput({ style, ...props }: ComponentPropsWithRef<typeof BaseTextInput>) {
  return <BaseTextInput {...props} style={[style, shippingTextFont(fontWeightOf(style))]} />;
}
