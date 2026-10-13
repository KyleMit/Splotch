import AnimatedImplementation from 'react-native-web/dist/vendor/react-native/Animated/AnimatedImplementation';
import AnimatedView from 'react-native-web/dist/vendor/react-native/Animated/components/AnimatedView';

// React Native Web's Animated export spreads this same implementation over six animated host
// components. Its FlatList, SectionList and ScrollView pull in VirtualizedList and the rest of the
// list machinery, about 100 KB of the startup path, and the app animates View only (ADR-0179).
export const Animated = { ...AnimatedImplementation, View: AnimatedView };
export { Easing } from 'react-native';
