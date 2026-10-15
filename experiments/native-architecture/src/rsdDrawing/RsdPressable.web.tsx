import { useContext, type ComponentProps, type PointerEvent } from 'react';
import { html } from 'react-strict-dom';
import { InertRegion } from './toolbarSkin';

// On the web the press styles are CSS :active, which the browser clears on its own. The style
// must be passed by name: React Strict DOM's Babel transform merges only a style it can see, so a
// style inside a spread reaches the DOM as an uncompiled array. Inside an inert region the press
// is dropped (InertRegion).
export function RsdPressable({
  style,
  onClick,
  onPointerDown,
  onPressBegin,
  ...props
}: ComponentProps<typeof html.button> & { onPressBegin?: () => void }) {
  const inert = useContext(InertRegion);
  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (inert) return;
    if (!props.disabled) onPressBegin?.();
    onPointerDown?.(event);
  };
  return (
    <html.button
      {...props}
      onClick={inert ? undefined : onClick}
      onPointerDown={begin}
      style={style}
    />
  );
}
