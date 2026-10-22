import { initialWindowMetrics, type Metrics } from 'react-native-safe-area-context';

export function useInitialSafeAreaMetrics(): Metrics | null {
  return initialWindowMetrics;
}
