import type { ComponentProps, ReactNode } from 'react';
import { css, html } from 'react-strict-dom';

type LinkStyle = ComponentProps<typeof html.button>['style'];

const styles = css.create({
  link: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textDecorationLine: {
      default: 'none',
      '@media (hover: hover)': { default: 'none', ':hover': 'underline' },
    },
  },
});

// A link in running copy that opens through its caller rather than an href: React Native has no
// anchor navigation, and every link here leaves the app behind a grown-up check. It is a button
// in a link's role, so it takes focus and a press on every platform, wearing none of a button's
// chrome; the caller sets its ink and type.
export function RsdTextLink({
  onPress,
  style,
  children,
}: {
  onPress: () => void;
  style?: LinkStyle;
  children: ReactNode;
}) {
  return (
    <html.button type="button" role="link" style={[styles.link, style]} onClick={onPress}>
      {children}
    </html.button>
  );
}
