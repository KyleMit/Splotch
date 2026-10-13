// React Native Web ships these vendored modules untyped; they are the values its own Animated
// export is assembled from, so they carry React Native's Animated types.
declare module 'react-native-web/dist/vendor/react-native/Animated/AnimatedImplementation' {
  import type { Animated } from 'react-native';
  const implementation: Omit<
    typeof Animated,
    'View' | 'Text' | 'Image' | 'ScrollView' | 'FlatList' | 'SectionList'
  >;
  export = implementation;
}

declare module 'react-native-web/dist/vendor/react-native/Animated/components/AnimatedView' {
  import type { Animated } from 'react-native';
  const view: typeof Animated.View;
  export = view;
}
