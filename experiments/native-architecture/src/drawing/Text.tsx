import { createContext, useContext, type ComponentPropsWithRef } from 'react';
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

// Nested text inherits its parent's weight, as React Native's own text does, so it
// takes the parent's face unless it sets a weight of its own.
const InheritedFontWeight = createContext<TextStyle['fontWeight']>(undefined);

export function Text({ style, children, ...props }: ComponentPropsWithRef<typeof BaseText>) {
  const inherited = useContext(InheritedFontWeight);
  const own = fontWeightOf(style);
  const font = shippingTextFont(own ?? inherited);
  return (
    <BaseText {...props} style={[style, font]}>
      {own === undefined ? (
        children
      ) : (
        <InheritedFontWeight value={own}>{children}</InheritedFontWeight>
      )}
    </BaseText>
  );
}

export function TextInput({ style, ...props }: ComponentPropsWithRef<typeof BaseTextInput>) {
  return <BaseTextInput {...props} style={[style, shippingTextFont(fontWeightOf(style))]} />;
}
