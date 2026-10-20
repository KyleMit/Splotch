import type { ComponentProps, ReactNode } from 'react';
import { Platform } from 'react-native';
import { css, html } from 'react-strict-dom';
import { RsdPageAnchor } from './RsdPageAnchor';

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

// A link in running copy that opens through its caller: React Native has no anchor navigation, and
// a link that leaves the app does so behind a grown-up check. It is a button in a link's role, so
// it takes focus and a press on every platform, wearing none of a button's chrome; the caller sets
// its ink and type. An in-app destination's address (`href`) makes it a real anchor on the web.
export function RsdTextLink({
  href,
  onPress,
  style,
  children,
}: {
  href?: string;
  onPress: () => void;
  style?: LinkStyle;
  children: ReactNode;
}) {
  if (href !== undefined && Platform.OS === 'web')
    return (
      <RsdPageAnchor href={href} onFollow={onPress} style={[styles.link, style]}>
        {children}
      </RsdPageAnchor>
    );
  return (
    <html.button type="button" role="link" style={[styles.link, style]} onClick={onPress}>
      {children}
    </html.button>
  );
}
